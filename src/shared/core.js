/**
 * Pure logic shared by the main process, the renderer and the tests.
 *
 * It is loaded two different ways, so it must stay free of Node APIs, DOM
 * APIs and side effects:
 *   - main process / tests: `require('./shared/core')`
 *   - renderer: a plain <script> tag before the module graph, which publishes
 *     the export list as `window.EM_CORE` for renderer/core-bridge.js to
 *     re-export. Renderer modules have their own scope, so they may reuse these
 *     names freely — they just have to import them rather than read globals.
 */

const QUADS = ['q1', 'q2', 'q3', 'q4'];
/**
 * The staging list above the matrix, where a task waits before it is classified.
 * It is a fifth value for `quadrant`, not a fifth quadrant: QUADS still drives
 * every 2×2 grid loop (renderMatrix, markEdge, the counts), so the inbox has to
 * be rendered on its own and cannot be folded into those.
 */
const INBOX = 'inbox';
/** Every place a task may legally sit. */
const PLACES = [INBOX, ...QUADS];
/** Where a task with an unknown quadrant lands. */
const FALLBACK_QUAD = 'q4';

/**
 * The two matrices the header toggle switches between. This is a property of
 * the *task*, not of the file: both boards live in one data.json, so a task
 * moving between them is one atomic save like every other change.
 *
 * The inbox is deliberately outside the split — it is shared, so anything
 * sitting there has `space: null` and shows up on both boards. Classifying it
 * (dragging it down into a quadrant) is what gives it a space.
 */
const SPACES = ['work', 'life'];
/** Where tasks saved before the split — and any unknown value — land. */
const DEFAULT_SPACE = 'work';
const SPACE_LABEL = { work: '업무', life: '일상' };

const sanitizeSpace = (v) => (SPACES.includes(v) ? v : DEFAULT_SPACE);

/**
 * The space a task in `quadrant` should carry. Kept in one place because both
 * the renderer (on add / drop) and `normalizeTasks` have to agree that the
 * inbox is space-less; if they drift, a shared task starts showing on only one
 * board or a classified one on neither.
 */
function spaceFor(quadrant, space) {
  if (quadrant === INBOX) return null;
  return sanitizeSpace(space);
}

/** Must match the add form's maxlength in index.html. */
const MAX_TEXT = 200;
/** Memos are free-form and multi-line, so they get a much looser cap. */
const MAX_MEMO = 2000;

const DAY_MS = 86400000;
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

/* ------------------------------------------------------------------ dates */

function startOfToday(now = new Date()) {
  const d = new Date(now.getTime());
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Next local midnight. Built by day arithmetic instead of `+ DAY_MS` so a DST
 * transition cannot put the rollover timer an hour off.
 */
function startOfTomorrow(now = new Date()) {
  const d = startOfToday(now);
  d.setDate(d.getDate() + 1);
  return d;
}

/** 'YYYY-MM-DD' → Date at local midnight, or null when unset/invalid. */
function parseDue(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return null;
  // Reject roll-overs like 2026-02-31 → Mar 3.
  if (date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/**
 * Label + urgency state for a due date, relative to `now`. Time-dependent, so
 * anything rendered from it has to be refreshed when the day changes.
 */
function dueInfo(value, now = new Date()) {
  const date = parseDue(value);
  if (!date) return null;
  const days = Math.round((date - startOfToday(now)) / DAY_MS);

  let text = `${date.getMonth() + 1}/${date.getDate()}(${WEEKDAY[date.getDay()]})`;
  if (date.getFullYear() !== now.getFullYear()) {
    text = `${String(date.getFullYear()).slice(2)}/${text}`;
  }

  let state = 'far';
  let hint;
  if (days < 0) {
    state = 'overdue';
    hint = `${-days}일 지남`;
  } else if (days === 0) {
    state = 'today';
    hint = '오늘';
  } else if (days === 1) {
    state = 'soon';
    hint = '내일';
  } else if (days <= 3) {
    state = 'soon';
    hint = `${days}일 남음`;
  } else {
    hint = `${days}일 남음`;
  }
  return { text, state, hint };
}

/* ------------------------------------------------------------------ tasks */

/** Trim and cut to the shared length cap; inline editing has no maxlength. */
function clampText(text) {
  return String(text == null ? '' : text)
    .trim()
    .slice(0, MAX_TEXT);
}

/**
 * Same idea for memos, but blank means "no memo": the caller stores null so
 * `task.memo` is either a non-empty string or absent, never `''`.
 */
function clampMemo(memo) {
  const trimmed = String(memo == null ? '' : memo)
    .trim()
    .slice(0, MAX_MEMO);
  return trimmed || null;
}

/**
 * A brain dump usually arrives as a block of text rather than one line at a
 * time, so every line of a paste becomes its own task. List markers people
 * paste along with it ("- ", "* ", "1. ") are stripped, blank lines drop out,
 * and the batch is capped so a stray paste of a whole document cannot flood
 * the store.
 */
const MAX_BULK_LINES = 100;

function splitBulkText(raw) {
  return String(raw == null ? '' : raw)
    .split(/\r?\n/)
    .map((line) => clampText(line.replace(/^\s*(?:[-*•·]|\d{1,3}[.)])\s+/, '')))
    .filter(Boolean)
    .slice(0, MAX_BULK_LINES);
}

/**
 * Fill in fields older saves predate, and repair the three fields whose bad
 * values are invisible: the matrix only walks QUADS and the inbox only reads
 * INBOX, so an unrecognised `quadrant` would keep the task in the file while it
 * disappears from every list; a `space` the toggle does not know would do the
 * same on both boards; and a non-string `memo` would render as
 * "[object Object]". Never drops entries — that is purgeTask()'s job alone.
 */
function normalizeTasks(list) {
  if (!Array.isArray(list)) return [];
  return list.map((t) => {
    const quadrant = PLACES.includes(t?.quadrant) ? t.quadrant : FALLBACK_QUAD;
    return {
      dueDate: null,
      deletedAt: null,
      completedAt: null,
      ...t,
      quadrant,
      space: spaceFor(quadrant, t?.space),
      memo: typeof t?.memo === 'string' ? clampMemo(t.memo) : null,
    };
  });
}

/* ----------------------------------------------------------------- layout */

const DEFAULT_LAYOUT = { cols: 0.5, rows: 0.5 };
const MIN_RATIO = 0.15;
const MAX_RATIO = 0.85;

const clampRatio = (v) => Math.min(MAX_RATIO, Math.max(MIN_RATIO, v));

/** Ratios are always real numbers in the store; null/"" must not read as 0. */
const asRatio = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);

/** Keep only sane numbers; anything else falls back to an even split. */
function sanitizeLayout(saved) {
  const next = { ...DEFAULT_LAYOUT };
  const cols = asRatio(saved?.cols);
  if (Number.isFinite(cols)) next.cols = clampRatio(cols);

  // Saves from the two-splitter layout gave each column its own row split;
  // the grid has a single shared one, so average them.
  const rows = Number.isFinite(asRatio(saved?.rows))
    ? asRatio(saved.rows)
    : (asRatio(saved?.left) + asRatio(saved?.right)) / 2;
  if (Number.isFinite(rows)) next.rows = clampRatio(rows);
  return next;
}

/**
 * The one export list, handed to whichever loader is running us.
 *
 * The name matters: in the renderer this is a classic script, so a top-level
 * `const` lands in the global lexical scope, and a plain `api` would collide
 * with the `window.api` that preload.js exposes (a SyntaxError that kills the
 * whole file).
 *
 * `require` (main process, tests) gets it as module.exports. The renderer loads
 * this file as a classic <script>, where top-level `const` bindings are *not*
 * properties of window — so the module graph could not reach them. Publishing
 * the same object on window gives renderer/core-bridge.js something to
 * re-export as named imports.
 */
const emCore = {
  QUADS,
  INBOX,
  PLACES,
  FALLBACK_QUAD,
  SPACES,
  DEFAULT_SPACE,
  SPACE_LABEL,
  sanitizeSpace,
  spaceFor,
  MAX_TEXT,
  MAX_MEMO,
  MAX_BULK_LINES,
  DAY_MS,
  WEEKDAY,
  startOfToday,
  startOfTomorrow,
  parseDue,
  dueInfo,
  clampText,
  clampMemo,
  splitBulkText,
  normalizeTasks,
  DEFAULT_LAYOUT,
  MIN_RATIO,
  MAX_RATIO,
  clampRatio,
  sanitizeLayout,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = emCore;
} else if (typeof window !== 'undefined') {
  window.EM_CORE = emCore;
}
