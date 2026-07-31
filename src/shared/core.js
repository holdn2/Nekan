/**
 * Pure logic shared by the main process, the renderer and the tests.
 *
 * It is loaded two different ways, so it must stay free of Node APIs, DOM
 * APIs and side effects:
 *   - main process / tests: `require('./shared/core')`
 *   - renderer: a plain <script> tag before renderer.js — every top-level
 *     binding becomes a global, which is why renderer.js must not re-declare
 *     these names (a second top-level `const` would be a SyntaxError).
 */

const QUADS = ['q1', 'q2', 'q3', 'q4'];
/** Where a task with an unknown quadrant lands. */
const FALLBACK_QUAD = 'q4';

/** Must match the add form's maxlength in index.html. */
const MAX_TEXT = 200;

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
 * Fill in fields older saves predate, and repair the one field whose bad value
 * is invisible: renderMatrix() only walks QUADS, so an unknown `quadrant`
 * would keep the task in the file while it disappears from every list.
 * Never drops entries — that is purgeTask()'s job alone.
 */
function normalizeTasks(list) {
  if (!Array.isArray(list)) return [];
  return list.map((t) => ({
    dueDate: null,
    deletedAt: null,
    completedAt: null,
    ...t,
    quadrant: QUADS.includes(t?.quadrant) ? t.quadrant : FALLBACK_QUAD,
  }));
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    QUADS,
    FALLBACK_QUAD,
    MAX_TEXT,
    DAY_MS,
    WEEKDAY,
    startOfToday,
    startOfTomorrow,
    parseDue,
    dueInfo,
    clampText,
    normalizeTasks,
    DEFAULT_LAYOUT,
    MIN_RATIO,
    MAX_RATIO,
    clampRatio,
    sanitizeLayout,
  };
}
