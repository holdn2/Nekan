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
 * When a quadrant is holding more than the method it stands for can carry.
 *
 * Only q1 gets a number, and it is the guide's own: "1분면이 5개를 넘으면
 * 우선순위가 없는 것과 같습니다". The others deliberately have none — q2 being
 * full is the entire point of the exercise, and putting a ceiling on q3 or q4
 * would be advice this app has never given anyone.
 *
 * It marks and never blocks. Refusing a task sends it back into somebody's
 * head, which is the one thing 다 꺼내기 exists to prevent.
 */
const CROWDED = { q1: 5 };

/** True when `count` is past the point that quadrant stops meaning anything. */
const isCrowded = (quadrant, count) =>
  Number(count) > (CROWDED[quadrant] ?? Infinity);

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

/**
 * Is the first-run question still unanswered?
 *
 * Shared because two processes act on the same answer and must not disagree:
 * the renderer decides whether to put the screen up, and main decides whether
 * it may return to bar mode at all. A 640x48 bar cannot hold a 380px card, and
 * main is the only side that can keep the window out of it in the first place —
 * by the time the renderer hears about the mode, it has already collapsed.
 */
const needsStartupChoice = (choice) => choice !== "sync" && choice !== "local";

/** Must match the add form's maxlength in index.html. */
const MAX_TEXT = 200;
/** Memos are free-form and multi-line, so they get a much looser cap. */
const MAX_MEMO = 2000;

const DAY_MS = 86400000;

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
 * What a due date *is*, relative to `now` — no words in it.
 *
 * This file is loaded twice, once by `require` and once as a classic script the
 * renderer runs ahead of its module graph, so it can hold neither a catalogue
 * nor the code to read one. That is why the split exists at all: the counting
 * lives here and the wording lives in `formatDue()` below, which is handed a
 * `t` rather than reaching for one.
 *
 * `state` stays on this side even though it looks like presentation. It is what
 * the stylesheets colour the chip by, and moving it across would tie the CSS to
 * whichever language is on screen.
 *
 * Time-dependent, so anything rendered from it has to be redrawn when the day
 * changes — see scheduleDayRollover in renderer/app.js.
 */
function dueInfo(value, now = new Date()) {
  const date = parseDue(value);
  if (!date) return null;
  const days = Math.round((date - startOfToday(now)) / DAY_MS);

  let state = "far";
  if (days < 0) state = "overdue";
  else if (days === 0) state = "today";
  else if (days <= 3) state = "soon";

  // Comparing years needs `now`, which formatDue() does not get. A date in
  // another year is written differently, so the comparison belongs here with
  // everything else that had to look at the clock.
  return {
    date,
    days,
    state,
    otherYear: date.getFullYear() !== now.getFullYear(),
  };
}

/**
 * The two strings a due date shows: the date itself and how far away it is.
 *
 * `t` is passed in rather than imported — see dueInfo above for why this file
 * cannot hold a catalogue. Both the renderer and the export call this, so the
 * chip on screen and the chip in a printed PDF can never word the same date
 * differently.
 *
 * The weekday comes from `Intl` instead of the catalogue: it is the one part
 * every locale already knows, and a hand-written list would be seven more
 * strings per language to get wrong. The rest of the shape is deliberately not
 * `Intl`'s — a full Korean date formats as "8. 3. (월)", which is wider than the
 * chip and reads nothing like the "8/3" it has always shown.
 */
function formatDue(info, t, locale) {
  if (!info) return null;
  const { date, days, otherYear } = info;

  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(
    date,
  );
  let text = `${date.getMonth() + 1}/${date.getDate()}(${weekday})`;
  if (otherYear) text = `${String(date.getFullYear()).slice(2)}/${text}`;

  let hint;
  if (days < 0) hint = t("due.overdue", { count: -days });
  else if (days === 0) hint = t("due.today");
  else if (days === 1) hint = t("due.tomorrow");
  else hint = t("due.remaining", { count: days });

  return { text, hint };
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
 * The next key after `a`, for a row going on the end of a list.
 *
 * Stepping one digit rather than halving the distance to the end. Both are
 * correct — appending only needs *some* key greater than `a` — but halving
 * runs out fast: from the middle there are five steps before the digit is
 * exhausted (31, 47, 55, 59, 61), so a list grew a character every five rows.
 * A thousand of them carried 200-character keys and orderKey was a quarter of
 * data.json, all of it also going over the wire on every sync. Stepping gets
 * 61 rows per character.
 *
 * The cost is real but the right way round: consecutive keys are now adjacent,
 * so a drop between two of them has to add a character where before there was
 * room to split. Appending happens on every new task; inserting happens on a
 * drag.
 *
 * The empty case keeps the old midpoint, and deliberately: that is the first
 * key in a quadrant, and starting it in the middle is what leaves room to
 * drop a row *above* it later. Deeper positions start at 1 instead — nothing
 * is ever inserted before them, because they only exist as the tail of a key
 * that already sorts after everything.
 */
function orderKeyAfter(a) {
  if (!a) return ORDER_DIGITS[Math.round(ORDER_BASE / 2)];

  // Walk past the digits with nothing left to give. Anything before the first
  // one that can still step is dropped, which keeps the key as short as the
  // ordering allows: after "Vz" the next key is "W", not "Vz1".
  let at = 0;
  while (at < a.length && ORDER_DIGITS.indexOf(a[at]) === ORDER_BASE - 1) {
    at += 1;
  }
  // Every digit was the last one. One more place, at its lowest usable digit —
  // never 0, which isOrderKey rejects for having no room in front of it.
  if (at === a.length) return a + ORDER_DIGITS[1];
  return a.slice(0, at) + ORDER_DIGITS[ORDER_DIGITS.indexOf(a[at]) + 1];
}

/**
 * A key strictly between `a` and `b`, where '' is the start of the list and
 * null is the end. Walks past the common prefix first, then splits the first
 * digit that differs; when those digits are neighbours there is no room at this
 * position, so it keeps `a`'s digit and goes one place deeper.
 */
function orderMidpoint(a, b) {
  // No `b` is not a midpoint at all — see orderKeyAfter for why the two cases
  // want different arithmetic.
  if (b === null) return orderKeyAfter(a);

  let n = 0;
  while ((a[n] || "0") === b[n]) n += 1;
  if (n > 0) return b.slice(0, n) + orderMidpoint(a.slice(n), b.slice(n));

  const digitA = a ? ORDER_DIGITS.indexOf(a[0]) : 0;
  const digitB = ORDER_DIGITS.indexOf(b[0]);

  if (digitB - digitA > 1) {
    return ORDER_DIGITS[Math.round(0.5 * (digitA + digitB))];
  }
  // The digits are adjacent. `b` has more to give if it is longer than one
  // digit; otherwise the room has to come from extending `a`. Anything after
  // `a` that keeps a's leading digit is still before `b`, so the tail is the
  // same "next key" problem.
  if (b.length > 1) return b.slice(0, 1);
  return ORDER_DIGITS[digitA] + orderKeyAfter(a.slice(1));
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
  return `${task.quadrant}\u0000${task.space === null ? "" : task.space}`;
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

/**
 * `inbox` and `memo` are heights in px, not ratios, and null means "whatever
 * the stylesheet says". The quadrants split a fixed box so a ratio is the
 * natural unit there; those two panels are told how tall to be, and what the
 * user wants is a list this tall -- not a list that is a quarter of whatever
 * the window happens to be.
 *
 * Both take their height out of the matrix, so both have the same ceiling:
 * whatever the grid can give up, which only the renderer can work out. That is
 * why neither is clamped from above here.
 */
const DEFAULT_LAYOUT = { cols: 0.5, rows: 0.5, inbox: null, memo: null };
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
 * Smallest the dump's list may be dragged to: one row and its padding. Below
 * that the panel says nothing the folded header does not already say, and the
 * fold is the control for "I do not want this open".
 */
const MIN_INBOX_PX = 56;

/**
 * Smallest the memo panel may be dragged to: its header and the first line of
 * the note. Below that the panel says nothing the row's memo mark does not
 * already say, and closing the note is the control for "not now".
 */
const MIN_MEMO_PX = 96;

/**
 * How tall the memo panel may be, given the room there is for it.
 *
 * The twin of clampInbox, floor apart, and for the same reason: `available` is
 * the panel's own height plus everything the matrix can give up, and only the
 * renderer knows what the grid is currently doing.
 */
function clampMemoPanel(value, available) {
  if (!Number.isFinite(value)) return MIN_MEMO_PX;
  return Math.max(
    MIN_MEMO_PX,
    Math.min(Math.round(value), Math.round(available)),
  );
}

/**
 * How tall the dump's list may be, given the room there is for it.
 *
 * `available` is the list's own height plus everything the matrix can give up
 * before it hits its own floor -- the caller works that out, because only the
 * renderer knows what the grid is currently doing. When there is not even the
 * minimum to be had, the minimum still wins: the matrix has its own overflow
 * rules for that case, and a list of zero height would read as a broken panel.
 */
function clampInbox(value, available) {
  if (!Number.isFinite(value)) return MIN_INBOX_PX;
  return Math.max(
    MIN_INBOX_PX,
    Math.min(Math.round(value), Math.round(available)),
  );
}

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

/* ------------------------------------------------------- window placement */

/**
 * Keep a `length` long window starting at `start` inside `min`..`min + span`.
 * A window taller or wider than the display gets the near edge; there is no
 * placement that fits, and hanging off the far edge hides the title bar.
 */
function clampSpan(start, length, min, span) {
  return Math.min(Math.max(start, min), Math.max(min, min + span - length));
}

/**
 * Where the expanded window goes when the bar grows into it.
 *
 * It asks the same question collapseOrigin asks — is this thing on the right
 * half of the display? — and that is the whole point. A bar on the right lines
 * its right edge up with the window's; one on the left grows from its own
 * top-left corner, where the user just clicked.
 *
 * It used to ask a different question: whether the window would fit if it grew
 * rightwards. That reads sensibly on its own and is wrong as half of a pair,
 * because a bar can sit right of centre and still have room to its right. Fold
 * such a window and it lands right-aligned; open it again and it grows the
 * other way, so the widget takes a step across the screen. Swept over every
 * starting position on a 2304px display, 333 of 1303 of them moved, by as much
 * as 318px; asking the mirrored question moves none of them.
 *
 * Vertically there is no such pivot — the window simply grows downwards — so a
 * bar near the bottom is pushed up by the clamp until it fits. Both axes are
 * clamped here rather than left to the caller: this is the function that knows
 * how big the window is about to become.
 *
 * `bar` is where the bar is *now*, never a remembered position — moving the
 * bar and then opening it has to open it where it was left.
 */
function expandOrigin(bar, size, area) {
  const middleOfScreen = area.x + area.width / 2;
  const onTheRight = bar.x + bar.width / 2 > middleOfScreen;
  const x = onTheRight ? bar.x + bar.width - size.width : bar.x;
  return {
    x: clampSpan(x, size.width, area.x, area.width),
    y: clampSpan(bar.y, size.height, area.y, area.height),
  };
}

/**
 * Where the bar goes when the expanded window folds into it.
 *
 * The window keeps whichever side of the display it is on: one whose middle is
 * past the middle of the screen folds onto its own right edge, so the bar stays
 * under the eye instead of jumping left and leaving a gap.
 *
 * This pairs with expandOrigin(): a window that was opened right-aligned folds
 * back to exactly the bar position it came from. A window sitting in the middle
 * can shift once on its first fold, and is stable from then on.
 */
function collapseOrigin(bounds, bar, area) {
  const middleOfScreen = area.x + area.width / 2;
  const onTheRight = bounds.x + bounds.width / 2 > middleOfScreen;
  const x = onTheRight ? bounds.x + bounds.width - bar.width : bounds.x;
  return {
    x: clampSpan(x, bar.width, area.x, area.width),
    y: clampSpan(bounds.y, bar.height, area.y, area.height),
  };
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

  // Held loosely on purpose: the upper bound depends on the window, which this
  // file cannot see. Anything at or above the floor is kept and clamped again
  // when it is applied, so a saved height from a big monitor comes back intact
  // on a small one instead of being rounded away on the way in.
  const inbox = asRatio(saved?.inbox);
  next.inbox =
    Number.isFinite(inbox) && inbox >= MIN_INBOX_PX ? Math.round(inbox) : null;

  // Held loosely for the same reason as the dump: the ceiling is the window's.
  const memo = asRatio(saved?.memo);
  next.memo =
    Number.isFinite(memo) && memo >= MIN_MEMO_PX ? Math.round(memo) : null;
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
  CROWDED,
  isCrowded,
  SPACES,
  DEFAULT_SPACE,
  sanitizeSpace,
  spaceFor,
  needsStartupChoice,
  MAX_TEXT,
  MAX_MEMO,
  MAX_BULK_LINES,
  DAY_MS,
  startOfToday,
  startOfTomorrow,
  parseDue,
  dueInfo,
  formatDue,
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
  MIN_INBOX_PX,
  MIN_MEMO_PX,
  clampInbox,
  clampMemoPanel,
  clampRatio,
  clampAxis,
  expandOrigin,
  collapseOrigin,
  sanitizeLayout,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = emCore;
} else if (typeof window !== "undefined") {
  window.EM_CORE = emCore;
}
