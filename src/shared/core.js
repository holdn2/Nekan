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

const QUADS = ["q1", "q2", "q3", "q4"];
/**
 * The staging list above the matrix, where a task waits before it is classified.
 * It is a fifth value for `quadrant`, not a fifth quadrant: QUADS still drives
 * every 2×2 grid loop (renderMatrix, markEdge, the counts), so the inbox has to
 * be rendered on its own and cannot be folded into those.
 */
const INBOX = "inbox";
/** Every place a task may legally sit. */
const PLACES = [INBOX, ...QUADS];
/** Where a task with an unknown quadrant lands. */
const FALLBACK_QUAD = "q4";

/**
 * The two matrices the header toggle switches between. This is a property of
 * the *task*, not of the file: both boards live in one data.json, so a task
 * moving between them is one atomic save like every other change.
 *
 * The inbox is deliberately outside the split — it is shared, so anything
 * sitting there has `space: null` and shows up on both boards. Classifying it
 * (dragging it down into a quadrant) is what gives it a space.
 */
const SPACES = ["work", "life"];
/** Where tasks saved before the split — and any unknown value — land. */
const DEFAULT_SPACE = "work";
const SPACE_LABEL = { work: "업무", life: "일상" };

/** Any unknown value — including undefined — reads as the default board. */
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
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const [y, m, d] = value.split("-").map(Number);
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

  let state = "far";
  let hint;
  if (days < 0) {
    state = "overdue";
    hint = `${-days}일 지남`;
  } else if (days === 0) {
    state = "today";
    hint = "오늘";
  } else if (days === 1) {
    state = "soon";
    hint = "내일";
  } else if (days <= 3) {
    state = "soon";
    hint = `${days}일 남음`;
  } else {
    hint = `${days}일 남음`;
  }
  return { text, state, hint };
}

/* ------------------------------------------------------------------ tasks */

/** Trim and cut to the shared length cap; inline editing has no maxlength. */
function clampText(text) {
  return String(text == null ? "" : text)
    .trim()
    .slice(0, MAX_TEXT);
}

/**
 * Same idea for memos, but blank means "no memo": the caller stores null so
 * `task.memo` is either a non-empty string or absent, never `''`.
 */
function clampMemo(memo) {
  const trimmed = String(memo == null ? "" : memo)
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

/** One pasted block → one task per surviving line. */
function splitBulkText(raw) {
  return String(raw == null ? "" : raw)
    .split(/\r?\n/)
    .map((line) => clampText(line.replace(/^\s*(?:[-*•·]|\d{1,3}[.)])\s+/, "")))
    .filter(Boolean)
    .slice(0, MAX_BULK_LINES);
}

/* ------------------------------------------------------------ order keys */

/**
 * Where a task sits inside its quadrant is a string, not an array position.
 *
 * The array cannot carry it once the list is shared between devices: a server
 * hands back a *set* of rows, and two devices that each reordered locally leave
 * nothing to merge from. A key that sorts lexicographically survives that,
 * and inserting between two neighbours only ever writes the row that moved —
 * renumbering the whole quadrant would make every move a full-list write.
 *
 * Keys are digit strings read as the fraction after an implied "0.", so there
 * is always room between any two of them. The alphabet is ASCII-ordered, which
 * is what lets a plain `<` on the strings be the comparison.
 */
const ORDER_DIGITS =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ORDER_BASE = ORDER_DIGITS.length;

/**
 * A key strictly between `a` and `b`, where '' is the start of the list and
 * null is the end. Walks past the common prefix first, then splits the first
 * digit that differs; when those digits are neighbours there is no room at this
 * position, so it keeps `a`'s digit and recurses one place deeper.
 */
function orderMidpoint(a, b) {
  if (b !== null) {
    let n = 0;
    while ((a[n] || "0") === b[n]) n += 1;
    if (n > 0) return b.slice(0, n) + orderMidpoint(a.slice(n), b.slice(n));
  }

  const digitA = a ? ORDER_DIGITS.indexOf(a[0]) : 0;
  const digitB = b !== null ? ORDER_DIGITS.indexOf(b[0]) : ORDER_BASE;

  if (digitB - digitA > 1) {
    return ORDER_DIGITS[Math.round(0.5 * (digitA + digitB))];
  }
  // The digits are adjacent. `b` has more to give if it is longer than one
  // digit; otherwise the room has to come from extending `a`.
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return ORDER_DIGITS[digitA] + orderMidpoint(a.slice(1), null);
}

/**
 * Is this a key this file could have produced?
 *
 * Being a non-empty string is not enough. Two shapes are unusable:
 *   - a character outside ORDER_DIGITS, which sorts against real keys by
 *     accident rather than by the alphabet's order;
 *   - a trailing lowest digit. There is no room in front of such a key —
 *     `orderKeyBetween(null, '0')` can only return `'00…'`, and that sorts
 *     *after* `'0'`, so a drop above the row would land below it.
 *
 * Neither can come out of orderMidpoint(); both can come from a hand-edited
 * file or, later, from another device. A row carrying one is treated as having
 * no key at all, which is what makes normalizeTasks() replace it.
 */
function isOrderKey(value) {
  return (
    typeof value === "string" &&
    value !== "" &&
    value[value.length - 1] !== ORDER_DIGITS[0] &&
    [...value].every((digit) => ORDER_DIGITS.includes(digit))
  );
}

/**
 * The order key for a row dropped between `before` and `after`. Either side may
 * be missing: no `before` means the head of the list, no `after` means the tail.
 *
 * A neighbour that is not a usable key — or a pair already out of sequence —
 * would make the midpoint meaningless, so the broken side is dropped rather
 * than thrown on: a bad key in the file must not stop a drag from completing.
 */
function orderKeyBetween(before, after) {
  const a = isOrderKey(before) ? before : "";
  const b = isOrderKey(after) ? after : null;
  if (b !== null && a >= b) return orderMidpoint("", b);
  return orderMidpoint(a, b);
}

/** Sort comparator for rows of one quadrant; ties break on id so it is total. */
function compareOrder(a, b) {
  const ka = typeof a?.orderKey === "string" ? a.orderKey : "";
  const kb = typeof b?.orderKey === "string" ? b.orderKey : "";
  if (ka !== kb) return ka < kb ? -1 : 1;
  const ia = String(a?.id);
  const ib = String(b?.id);
  if (ia === ib) return 0;
  return ia < ib ? -1 : 1;
}

/** Keys only have to be unique within one quadrant of one board. */
function orderGroupOf(task) {
  return `${task.quadrant} ${task.space === null ? "" : task.space}`;
}

const hasOrderKey = (t) => isOrderKey(t?.orderKey);

/**
 * Give a key to every row saved before the field existed, in the array order
 * the old builds displayed — that array order *is* the user's ordering, and
 * losing it would shuffle their quadrants on first launch.
 *
 * Rows that already have a key keep it, so a file that is half migrated (a sync
 * could deliver one) fills only its gaps: each missing row is placed between
 * the previous key in its group and the next existing one.
 */
function assignOrderKeys(list) {
  if (list.every(hasOrderKey)) return list;

  // The nearest existing key *after* each index, within the same group.
  const following = new Array(list.length).fill(null);
  const seen = new Map();
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const group = orderGroupOf(list[i]);
    following[i] = seen.has(group) ? seen.get(group) : null;
    if (hasOrderKey(list[i])) seen.set(group, list[i].orderKey);
  }

  const previous = new Map();
  list.forEach((task, i) => {
    const group = orderGroupOf(task);
    if (hasOrderKey(task)) {
      previous.set(group, task.orderKey);
      return;
    }
    const key = orderKeyBetween(previous.get(group) || null, following[i]);
    task.orderKey = key;
    previous.set(group, key);
  });
  return list;
}

/* ------------------------------------------------------------- tombstones */

/**
 * How long a permanently deleted row stays in the file as a tombstone.
 *
 * Deleting for real used to mean dropping the row from the array, which works
 * exactly as long as the array is the only copy. Once another device has it,
 * a row that simply disappears here is a row that device still has — and it
 * pushes it back. The tombstone is what tells the other side "this is gone".
 * It can only be dropped for good once every device has certainly seen it.
 */
const TOMBSTONE_TTL_MS = 90 * DAY_MS;

/**
 * Drop tombstones old enough that no device can still be carrying the row.
 * The only place a task really leaves the array — everything else is a flag.
 */
function dropExpiredTombstones(list, now = Date.now()) {
  if (!Array.isArray(list)) return [];
  return list.filter(
    (t) =>
      !(Number.isFinite(t?.purgedAt) && now - t.purgedAt > TOMBSTONE_TTL_MS),
  );
}

/**
 * Fill in fields older saves predate, and repair the ones whose bad values are
 * invisible: the matrix only walks QUADS and the inbox only reads INBOX, so an
 * unrecognised `quadrant` would keep the task in the file while it disappears
 * from every list; a `space` the toggle does not know would do the same on both
 * boards; a missing `orderKey` would collapse a quadrant's order; and a
 * non-string `memo` would render as "[object Object]".
 *
 * Never drops entries — that is dropExpiredTombstones()'s job alone.
 */
function normalizeTasks(list) {
  if (!Array.isArray(list)) return [];
  const normalized = list.map((t) => {
    const quadrant = PLACES.includes(t?.quadrant) ? t.quadrant : FALLBACK_QUAD;
    const createdAt = Number.isFinite(t?.createdAt) ? t.createdAt : 0;
    return {
      dueDate: null,
      deletedAt: null,
      completedAt: null,
      ...t,
      quadrant,
      space: spaceFor(quadrant, t?.space),
      memo: typeof t?.memo === "string" ? clampMemo(t.memo) : null,
      // A row that predates the field has never been edited since it was
      // written, so its creation time is the honest last-changed time.
      updatedAt: Number.isFinite(t?.updatedAt) ? t.updatedAt : createdAt,
      purgedAt: Number.isFinite(t?.purgedAt) ? t.purgedAt : null,
      orderKey: hasOrderKey(t) ? t.orderKey : null,
    };
  });
  return assignOrderKeys(normalized);
}

/* ----------------------------------------------------------------- layout */

const DEFAULT_LAYOUT = { cols: 0.5, rows: 0.5 };
const MIN_RATIO = 0.15;
const MAX_RATIO = 0.85;

/** Keep a quadrant from being dragged away to nothing. */
const clampRatio = (v) => Math.min(MAX_RATIO, Math.max(MIN_RATIO, v));

/**
 * Smallest a quadrant may be dragged to, in pixels, where the window can afford
 * it. They live here with the ratio bounds because the drag clamp below and the
 * renderer's grid `minmax()` floor have to be the same number — if they drift,
 * the drag stops at one size while the grid lays out at another.
 */
const MIN_COL_PX = 180;
const MIN_ROW_PX = 110;

/**
 * The clamp a drag uses: a pixel minimum while `span` is big enough to honour
 * it, and the plain ratio floor once it is not.
 *
 * The upper bound is `MAX_RATIO` and the mirror of the floor, whichever is
 * tighter. Taking the mirror alone would silently assume MAX_RATIO is always
 * 1 - MIN_RATIO, and changing one of them in this file would then not reach the
 * drag at all.
 */
function clampAxis(value, span, minPx) {
  if (!Number.isFinite(value)) return 0.5;
  const floor = span > 0 ? Math.min(minPx / span, 0.5) : MIN_RATIO;
  const low = Math.max(MIN_RATIO, floor);
  const high = Math.min(MAX_RATIO, 1 - low);
  return Math.min(high, Math.max(low, value));
}

/** Ratios are always real numbers in the store; null/"" must not read as 0. */
const asRatio = (v) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);

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
  isOrderKey,
  orderKeyBetween,
  compareOrder,
  TOMBSTONE_TTL_MS,
  dropExpiredTombstones,
  normalizeTasks,
  DEFAULT_LAYOUT,
  MIN_RATIO,
  MAX_RATIO,
  MIN_COL_PX,
  MIN_ROW_PX,
  clampRatio,
  clampAxis,
  sanitizeLayout,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = emCore;
} else if (typeof window !== "undefined") {
  window.EM_CORE = emCore;
}
