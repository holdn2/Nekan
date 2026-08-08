const test = require("node:test");
const assert = require("node:assert/strict");

const {
  QUADS,
  INBOX,
  PLACES,
  CROWDED,
  isCrowded,
  SPACES,
  DEFAULT_SPACE,
  sanitizeSpace,
  spaceFor,
  needsStartupChoice,
  MAX_TEXT,
  MAX_BULK_LINES,
  splitBulkText,
  startOfToday,
  startOfTomorrow,
  parseDue,
  dueInfo,
  MAX_MEMO,
  clampText,
  clampMemo,
  normalizeTasks,
  isOrderKey,
  orderKeyBetween,
  compareOrder,
  TOMBSTONE_TTL_MS,
  dropExpiredTombstones,
  sanitizeLayout,
  DEFAULT_LAYOUT,
  MIN_RATIO,
  MAX_RATIO,
  MIN_COL_PX,
  MIN_ROW_PX,
  clampAxis,
  expandOrigin,
  collapseOrigin,
} = require("../src/shared/core");

/** A 1920x1080 display starting at the origin, minus nothing. */
const SCREEN = { x: 0, y: 0, width: 1920, height: 1080 };
const BAR = { width: 600, height: 48 };
const WIN = { width: 1000, height: 700 };

/** Local 'YYYY-MM-DD' for a day offset from today, the way the UI writes it. */
function dayString(offset) {
  const d = startOfToday();
  d.setDate(d.getDate() + offset);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

test("normalizeTasks fills fields older saves predate", () => {
  const [task] = normalizeTasks([{ id: "a", text: "x", quadrant: "q2" }]);
  assert.equal(task.dueDate, null);
  assert.equal(task.completedAt, null);
  assert.equal(task.deletedAt, null);
});

test("normalizeTasks keeps existing values, including falsy timestamps", () => {
  const [task] = normalizeTasks([
    {
      id: "a",
      text: "x",
      quadrant: "q1",
      dueDate: "2026-01-02",
      completedAt: 5,
    },
  ]);
  assert.equal(task.dueDate, "2026-01-02");
  assert.equal(task.completedAt, 5);
});

test("normalizeTasks rescues an unknown quadrant", () => {
  const bad = [
    { id: "a", text: "a", quadrant: "q5" },
    { id: "b", text: "b" },
    { id: "c", text: "c", quadrant: null },
    { id: "d", text: "d", quadrant: "INBOX" },
  ];
  for (const task of normalizeTasks(bad)) {
    assert.ok(QUADS.includes(task.quadrant), `${task.id} landed outside QUADS`);
  }
});

test("normalizeTasks keeps a task parked in the inbox there", () => {
  // The inbox is a fifth legal place, not a bad quadrant to be repaired — a
  // brain dump must survive a restart without being swept into q4.
  const [task] = normalizeTasks([{ id: "a", text: "x", quadrant: INBOX }]);
  assert.equal(task.quadrant, INBOX);
  assert.ok(PLACES.includes(INBOX));
  assert.ok(!QUADS.includes(INBOX), "the grid loops must not walk the inbox");
});

test("normalizeTasks puts a save from before the split on a board", () => {
  // Without a default here every pre-split task would match neither 업무 nor
  // 일상 and vanish from both matrices while still sitting in data.json.
  const [task] = normalizeTasks([{ id: "a", text: "x", quadrant: "q2" }]);
  assert.equal(task.space, DEFAULT_SPACE);
  assert.ok(SPACES.includes(task.space));
});

test("normalizeTasks rescues an unknown space the same way", () => {
  const bad = [
    { id: "a", text: "a", quadrant: "q1", space: "other" },
    { id: "b", text: "b", quadrant: "q1", space: null },
    { id: "c", text: "c", quadrant: "q1", space: 3 },
  ];
  for (const task of normalizeTasks(bad)) {
    assert.ok(SPACES.includes(task.space), `${task.id} landed on no board`);
  }
});

test("normalizeTasks keeps a chosen board", () => {
  const [task] = normalizeTasks([
    { id: "a", text: "x", quadrant: "q3", space: "life" },
  ]);
  assert.equal(task.space, "life");
});

test("the inbox belongs to no board, so both matrices show it", () => {
  // `space: null` is what makes "다 꺼내기" shared. A stale space on an inbox
  // task is dropped rather than honoured, or the row would show on one side
  // only after being dragged back up.
  const [fresh, stale] = normalizeTasks([
    { id: "a", text: "x", quadrant: INBOX },
    { id: "b", text: "y", quadrant: INBOX, space: "work" },
  ]);
  assert.equal(fresh.space, null);
  assert.equal(stale.space, null);
});

test("only q1 is ever crowded — a full q2 is the point of the method", () => {
  assert.equal(isCrowded("q1", CROWDED.q1), false);
  assert.equal(isCrowded("q1", CROWDED.q1 + 1), true);
  for (const q of ["q2", "q3", "q4", INBOX]) {
    assert.equal(isCrowded(q, 9999), false, q);
  }
});

test("isCrowded survives a count that is not a number", () => {
  assert.equal(isCrowded("q1", undefined), false);
  assert.equal(isCrowded("q1", "몇 개"), false);
  assert.equal(isCrowded(undefined, 9999), false);
});

test("spaceFor is the one rule both the renderer and normalize follow", () => {
  assert.equal(spaceFor(INBOX, "work"), null);
  assert.equal(spaceFor("q1", "life"), "life");
  assert.equal(spaceFor("q1", undefined), DEFAULT_SPACE);
  assert.equal(sanitizeSpace("life"), "life");
  assert.equal(sanitizeSpace("nope"), DEFAULT_SPACE);
});

test("needsStartupChoice keeps main and the renderer on one answer", () => {
  // A 1.0.2 file has no such key, and its owner has to meet the screen once.
  assert.equal(needsStartupChoice(undefined), true);
  assert.equal(needsStartupChoice(null), true);
  // Anything that is not one of the two answers is not an answer. Main leans on
  // this to decide it may not open as a bar, so a stray value has to read as
  // unanswered rather than let a 380px card into a 48px window.
  assert.equal(needsStartupChoice("later"), true);
  assert.equal(needsStartupChoice("sync"), false);
  assert.equal(needsStartupChoice("local"), false);
});

test("splitBulkText turns a pasted block into one task per line", () => {
  assert.deepEqual(splitBulkText("보고서 초안\n치과 예약\n회고 정리"), [
    "보고서 초안",
    "치과 예약",
    "회고 정리",
  ]);
});

test("splitBulkText drops blank lines and pasted list markers", () => {
  assert.deepEqual(
    splitBulkText("- 보고서\r\n\r\n* 치과\n1. 회고\n2) 운동\n   \n• 장보기"),
    ["보고서", "치과", "회고", "운동", "장보기"],
  );
});

test("splitBulkText applies the same caps as a typed task", () => {
  assert.deepEqual(splitBulkText("  여백  "), ["여백"]);
  assert.equal(splitBulkText("x".repeat(MAX_TEXT + 50))[0].length, MAX_TEXT);
  const flood = Array.from({ length: MAX_BULK_LINES + 40 }, (_, i) => `t${i}`);
  assert.equal(splitBulkText(flood.join("\n")).length, MAX_BULK_LINES);
});

test("splitBulkText yields nothing for input that is all whitespace", () => {
  assert.deepEqual(splitBulkText("\n\n   \n"), []);
  assert.deepEqual(splitBulkText(null), []);
  assert.deepEqual(splitBulkText(undefined), []);
});

test("normalizeTasks never drops entries", () => {
  const list = [
    { id: "a", text: "a", quadrant: "q1" },
    { id: "b", text: "b", quadrant: "zzz", deletedAt: 1 },
    { id: "c", text: "c", quadrant: "q3", completedAt: 2 },
  ];
  assert.equal(normalizeTasks(list).length, 3);
  assert.deepEqual(
    normalizeTasks(list).map((t) => t.id),
    ["a", "b", "c"],
  );
});

test("normalizeTasks tolerates a missing or broken tasks array", () => {
  assert.deepEqual(normalizeTasks(undefined), []);
  assert.deepEqual(normalizeTasks(null), []);
  assert.deepEqual(normalizeTasks("nope"), []);
});

test("clampText trims and caps at the shared limit", () => {
  assert.equal(clampText("  hi  "), "hi");
  assert.equal(clampText("x".repeat(MAX_TEXT + 50)).length, MAX_TEXT);
  assert.equal(clampText(null), "");
  assert.equal(clampText(undefined), "");
});

test("clampMemo trims, caps, and turns blank into null", () => {
  assert.equal(clampMemo("  note  "), "note");
  assert.equal(clampMemo("line\nline"), "line\nline");
  assert.equal(clampMemo("x".repeat(MAX_MEMO + 50)).length, MAX_MEMO);
  assert.equal(clampMemo("   "), null);
  assert.equal(clampMemo(""), null);
  assert.equal(clampMemo(null), null);
  assert.equal(clampMemo(undefined), null);
});

test("normalizeTasks defaults memo and rejects non-strings", () => {
  const [plain, str, obj, blank] = normalizeTasks([
    { id: "a", text: "a", quadrant: "q1" },
    { id: "b", text: "b", quadrant: "q1", memo: "  hi  " },
    { id: "c", text: "c", quadrant: "q1", memo: { oops: 1 } },
    { id: "d", text: "d", quadrant: "q1", memo: "   " },
  ]);
  assert.equal(plain.memo, null);
  assert.equal(str.memo, "hi");
  // A non-string would render as "[object Object]" in the panel.
  assert.equal(obj.memo, null);
  assert.equal(blank.memo, null);
});

test("parseDue accepts only real YYYY-MM-DD days", () => {
  assert.equal(parseDue("2026-02-31"), null);
  assert.equal(parseDue("2026-13-01"), null);
  assert.equal(parseDue("26-01-01"), null);
  assert.equal(parseDue(""), null);
  assert.equal(parseDue(null), null);
  assert.equal(parseDue("2026-03-09").getDate(), 9);
});

test("dueInfo classifies days relative to today", () => {
  assert.equal(dueInfo(dayString(-2)).state, "overdue");
  assert.equal(dueInfo(dayString(-2)).hint, "2일 지남");
  assert.equal(dueInfo(dayString(0)).state, "today");
  assert.equal(dueInfo(dayString(1)).hint, "내일");
  assert.equal(dueInfo(dayString(3)).state, "soon");
  assert.equal(dueInfo(dayString(4)).state, "far");
  assert.equal(dueInfo(null), null);
});

test("dueInfo is relative to the day it is asked about, not the parse", () => {
  const due = "2026-03-10";
  const before = new Date(2026, 2, 9, 23, 59, 59);
  const after = new Date(2026, 2, 10, 0, 0, 1);
  assert.equal(dueInfo(due, before).state, "soon");
  assert.equal(dueInfo(due, before).hint, "내일");
  // Same task, one second later: the label must move on its own.
  assert.equal(dueInfo(due, after).state, "today");
});

test("dueInfo prefixes the year only when it differs from now", () => {
  const now = new Date(2026, 5, 1);
  assert.equal(dueInfo("2026-06-10", now).text.startsWith("6/10"), true);
  assert.equal(dueInfo("2027-06-10", now).text.startsWith("27/"), true);
});

test("startOfTomorrow lands on the next local midnight", () => {
  const now = new Date(2026, 2, 9, 17, 30, 12, 400);
  const next = startOfTomorrow(now);
  assert.equal(next.getDate(), 10);
  assert.equal(next.getHours(), 0);
  assert.equal(next.getMinutes(), 0);
  assert.ok(next.getTime() > now.getTime());
});

test("sanitizeLayout clamps ratios into the drag range", () => {
  assert.deepEqual(sanitizeLayout({ cols: 0.01, rows: 0.99 }), {
    cols: MIN_RATIO,
    rows: MAX_RATIO,
  });
  assert.deepEqual(sanitizeLayout({ cols: 0.3, rows: 0.7 }), {
    cols: 0.3,
    rows: 0.7,
  });
});

test("sanitizeLayout falls back to an even split for junk", () => {
  for (const junk of [
    undefined,
    null,
    {},
    { cols: null, rows: "0.4" },
    { cols: NaN },
  ]) {
    assert.deepEqual(sanitizeLayout(junk), DEFAULT_LAYOUT);
  }
});

test("sanitizeLayout averages the legacy per-column row split", () => {
  assert.deepEqual(sanitizeLayout({ cols: 0.4, left: 0.3, right: 0.5 }), {
    cols: 0.4,
    rows: 0.4,
  });
});

/* ------------------------------------------------- quadrant drag clamping */

test("clampAxis honours the pixel minimum while the window can afford it", () => {
  // 1000px wide: 180px is 18% of it, so the drag stops there rather than at the
  // 15% ratio floor.
  const near = (got, want) =>
    assert.ok(Math.abs(got - want) < 1e-9, `${got} != ${want}`);
  near(clampAxis(0.05, 1000, MIN_COL_PX), 0.18);
  near(clampAxis(0.95, 1000, MIN_COL_PX), 0.82);
  // Well inside the range, the value passes through untouched.
  assert.equal(clampAxis(0.42, 1000, MIN_COL_PX), 0.42);
});

test("clampAxis falls back to the ratio floor once the window is too small", () => {
  // 400px wide: 180px would be 45% per side, which leaves nothing. The floor is
  // capped at half, then the ratio bounds take over.
  const low = clampAxis(0, 400, MIN_COL_PX);
  assert.ok(low >= MIN_RATIO && low <= 0.5);
  assert.ok(Math.abs(clampAxis(1, 400, MIN_COL_PX) - (1 - low)) < 1e-9);
});

test("clampAxis never leaves the shared ratio bounds", () => {
  for (const span of [0, 120, 400, 1000, 4000]) {
    for (const value of [-5, 0, 0.01, 0.5, 0.99, 5]) {
      const got = clampAxis(value, span, MIN_ROW_PX);
      assert.ok(
        got >= MIN_RATIO && got <= MAX_RATIO,
        `clampAxis(${value}, ${span}) = ${got} escaped [${MIN_RATIO}, ${MAX_RATIO}]`,
      );
    }
  }
});

test("clampAxis recovers from a non-number instead of poisoning the layout", () => {
  // A NaN would otherwise reach the grid template and blank the matrix.
  assert.equal(clampAxis(NaN, 1000, MIN_COL_PX), 0.5);
  assert.equal(clampAxis(undefined, 1000, MIN_COL_PX), 0.5);
});

test("a zero span cannot produce a ratio outside the bounds", () => {
  // The grid is measured before it has been laid out on the first drag frame.
  const got = clampAxis(0.9, 0, MIN_COL_PX);
  assert.ok(got >= MIN_RATIO && got <= MAX_RATIO);
});

/* -------------------------------------------------------------- order keys */

test("an order key lands strictly between its neighbours", () => {
  const a = orderKeyBetween(null, null);
  const before = orderKeyBetween(null, a);
  const after = orderKeyBetween(a, null);
  assert.ok(before < a, `${before} < ${a}`);
  assert.ok(a < after, `${a} < ${after}`);

  const middle = orderKeyBetween(a, after);
  assert.ok(a < middle && middle < after, `${a} < ${middle} < ${after}`);
});

test("there is always room between two keys, however close", () => {
  // Repeatedly inserting at the same spot is the case that breaks a scheme
  // built on numbers: eventually there is no value left between two rows.
  let low = orderKeyBetween(null, null);
  let high = orderKeyBetween(low, null);
  for (let i = 0; i < 200; i += 1) {
    const mid = orderKeyBetween(low, high);
    assert.ok(low < mid && mid < high, `round ${i}: ${low} < ${mid} < ${high}`);
    high = mid;
  }
});

test("appending stays ordered over a long run", () => {
  const keys = [];
  let last = null;
  for (let i = 0; i < 200; i += 1) {
    last = orderKeyBetween(last, null);
    keys.push(last);
  }
  assert.deepEqual(keys, [...keys].sort());
});

test("appending does not grow the key without bound", () => {
  // Halving the distance to the end of the list gave five appends per
  // character: a thousand rows carried 200-character keys, and every one of
  // them went to the server on each sync. Stepping a digit instead is what
  // keeps this flat, so the bound is the point of the test.
  let last = null;
  for (let i = 0; i < 1000; i += 1) last = orderKeyBetween(last, null);
  assert.ok(last.length <= 20, `1000 appends produced ${last.length} chars`);
  assert.ok(isOrderKey(last), `got ${last}`);
});

test("new keys sort after the ones the old midpoint scheme wrote", () => {
  // No migration: a quadrant filled before this change keeps its keys, and
  // rows added afterwards land in the same list. 'zzzz' is where the old
  // scheme ended up after a few hundred appends, and it is the shape most
  // likely to trip a stepping rule — every digit is already the last one.
  const existing = ["V", "n", "z", "zV", "zn", "zz", "zzV", "zzz"];
  const keys = [...existing];
  let last = existing[existing.length - 1];
  for (let i = 0; i < 100; i += 1) {
    last = orderKeyBetween(last, null);
    keys.push(last);
  }
  assert.deepEqual(keys, [...keys].sort());
  assert.ok(keys.every(isOrderKey));
});

test("a drop between two neighbours still lands between them", () => {
  // Stepping leaves consecutive keys adjacent, so this is the case that pays
  // for the shorter appends. It has to keep working, and repeatedly.
  let a = orderKeyBetween(null, null);
  let b = orderKeyBetween(a, null);
  for (let i = 0; i < 50; i += 1) {
    const mid = orderKeyBetween(a, b);
    assert.ok(a < mid && mid < b, `${a} < ${mid} < ${b} failed at ${i}`);
    assert.ok(isOrderKey(mid), `got ${mid}`);
    b = mid;
  }
});

test("prepending stays ordered over a long run", () => {
  const keys = [];
  let first = null;
  for (let i = 0; i < 200; i += 1) {
    first = orderKeyBetween(null, first);
    keys.unshift(first);
  }
  assert.deepEqual(keys, [...keys].sort());
});

test("a pair already out of sequence still yields a usable key", () => {
  // A hand-edited or half-synced file can hand us a reversed pair; the drop has
  // to complete anyway, landing before the row it was aimed at.
  const low = orderKeyBetween(null, null);
  const high = orderKeyBetween(low, null);
  const got = orderKeyBetween(high, low);
  assert.ok(got < low, `${got} < ${low}`);
});

test("a key with no room in front of it is not a key", () => {
  // '0' is the trap: there is nothing between the head of the list and it, so
  // orderKeyBetween(null, '0') can only answer '00…' — which sorts *after*
  // '0' and would drop a row below the one it was aimed above.
  assert.equal(isOrderKey("0"), false);
  assert.equal(isOrderKey("V0"), false);
  assert.equal(isOrderKey(""), false);
  assert.equal(isOrderKey("V~"), false, "digit outside the alphabet");
  assert.equal(isOrderKey(null), false);
  assert.equal(isOrderKey("V"), true);
  assert.equal(isOrderKey("0V"), true, "a leading lowest digit is fine");
});

test("normalizeTasks replaces a key that cannot be inserted in front of", () => {
  const [zero] = normalizeTasks([
    { id: "a", quadrant: "q1", space: "work", orderKey: "0" },
  ]);
  assert.ok(isOrderKey(zero.orderKey), `got ${zero.orderKey}`);

  const [junk] = normalizeTasks([
    { id: "b", quadrant: "q1", space: "work", orderKey: "~~" },
  ]);
  assert.ok(isOrderKey(junk.orderKey), `got ${junk.orderKey}`);
});

test("a drop above a repaired row really lands above it", () => {
  // The whole point of rejecting '0': before the repair this ordered a, c, b.
  const [head, tail] = normalizeTasks([
    { id: "a", quadrant: "q1", space: "work", orderKey: "0" },
    { id: "b", quadrant: "q1", space: "work", orderKey: "V" },
  ]);
  const dropped = { id: "c", orderKey: orderKeyBetween(null, head.orderKey) };
  const order = [head, tail, dropped].sort(compareOrder).map((t) => t.id);
  assert.deepEqual(order, ["c", "a", "b"]);
});

test("orderKeyBetween ignores a neighbour it could not have produced", () => {
  // A drag must still complete when the file holds a key from somewhere else.
  assert.ok(isOrderKey(orderKeyBetween("~~", null)));
  assert.ok(isOrderKey(orderKeyBetween(null, "~~")));
  assert.ok(isOrderKey(orderKeyBetween("0", "0")));
});

test("compareOrder falls back to the id so the sort is total", () => {
  const a = { id: "a", orderKey: "V" };
  const b = { id: "b", orderKey: "V" };
  assert.ok(compareOrder(a, b) < 0);
  assert.ok(compareOrder(b, a) > 0);
  assert.equal(compareOrder(a, a), 0);
});

test("normalizeTasks keeps the array order of a save that predates orderKey", () => {
  const saved = ["first", "second", "third"].map((id) => ({
    id,
    quadrant: "q1",
    space: "work",
  }));
  const sorted = normalizeTasks(saved).sort(compareOrder);
  assert.deepEqual(
    sorted.map((t) => t.id),
    ["first", "second", "third"],
  );
});

test("order keys are per quadrant and per board, not global", () => {
  const saved = [
    { id: "w1", quadrant: "q1", space: "work" },
    { id: "l1", quadrant: "q1", space: "life" },
    { id: "w2", quadrant: "q1", space: "work" },
    { id: "q2a", quadrant: "q2", space: "work" },
  ];
  const byId = Object.fromEntries(normalizeTasks(saved).map((t) => [t.id, t]));
  // Each group starts from scratch, so the first row of every group shares a
  // key — they are only ever compared against their own quadrant.
  assert.equal(byId.w1.orderKey, byId.l1.orderKey);
  assert.equal(byId.w1.orderKey, byId.q2a.orderKey);
  assert.ok(byId.w1.orderKey < byId.w2.orderKey);
});

test("a half-migrated list keeps the keys it already has", () => {
  const existing = orderKeyBetween(null, null);
  const saved = [
    { id: "new", quadrant: "q1", space: "work" },
    { id: "kept", quadrant: "q1", space: "work", orderKey: existing },
  ];
  const byId = Object.fromEntries(normalizeTasks(saved).map((t) => [t.id, t]));
  assert.equal(byId.kept.orderKey, existing);
  // The row without a key was listed first, so it has to sort first.
  assert.ok(byId.new.orderKey < existing);
});

/* -------------------------------------------------------------- tombstones */

test("normalizeTasks fills updatedAt and purgedAt", () => {
  const [task] = normalizeTasks([{ id: "a", quadrant: "q1", createdAt: 1234 }]);
  // Never edited since it was written, so creation time is the honest answer.
  assert.equal(task.updatedAt, 1234);
  assert.equal(task.purgedAt, null);

  const [stamped] = normalizeTasks([
    { id: "b", quadrant: "q1", updatedAt: 99 },
  ]);
  assert.equal(stamped.updatedAt, 99);
});

test("a tombstone survives normalization instead of being dropped", () => {
  const list = normalizeTasks([
    { id: "gone", quadrant: "q1", purgedAt: 5, text: "" },
  ]);
  assert.equal(list.length, 1);
  assert.equal(list[0].purgedAt, 5);
});

test("tombstones are dropped only once they are older than the TTL", () => {
  const now = 1_000_000_000_000;
  const list = [
    { id: "live", purgedAt: null },
    { id: "fresh", purgedAt: now - 1000 },
    { id: "expired", purgedAt: now - TOMBSTONE_TTL_MS - 1 },
  ];
  assert.deepEqual(
    dropExpiredTombstones(list, now).map((t) => t.id),
    ["live", "fresh"],
  );
});

test("dropExpiredTombstones ignores a rubbish purgedAt", () => {
  const now = 1_000_000_000_000;
  const list = [{ id: "a", purgedAt: "yesterday" }, { id: "b" }];
  assert.equal(dropExpiredTombstones(list, now).length, 2);
  assert.deepEqual(dropExpiredTombstones(null, now), []);
});

/* -------------------------------------------------- expand / collapse spot */

test("the window grows from the bar's own corner", () => {
  const bar = { x: 200, y: 140, width: BAR.width, height: BAR.height };
  assert.deepEqual(expandOrigin(bar, WIN, SCREEN), { x: 200, y: 140 });
});

test("a bar near the right edge grows leftwards instead", () => {
  // Growing right from 1200 would end at 2200 on a 1920 screen: most of the
  // window would be off the display.
  const bar = { x: 1200, y: 60, width: BAR.width, height: BAR.height };
  const at = expandOrigin(bar, WIN, SCREEN);
  // The two right edges line up: 1200 + 600 === 800 + 1000.
  assert.deepEqual(at, { x: 800, y: 60 });
  assert.equal(at.x + WIN.width, bar.x + bar.width);
});

test("the bar folds out of whichever side the window is on", () => {
  const left = { x: 100, y: 90, width: WIN.width, height: WIN.height };
  assert.deepEqual(collapseOrigin(left, BAR, SCREEN), { x: 100, y: 90 });

  const right = { x: 800, y: 90, width: WIN.width, height: WIN.height };
  // Right edges line up again: 800 + 1000 === 1200 + 600.
  assert.deepEqual(collapseOrigin(right, BAR, SCREEN), { x: 1200, y: 90 });
});

test("opening and folding a right-hand window is a round trip", () => {
  // The pair has to settle, or every toggle would walk the widget across the
  // screen. A bar on the right opens left-aligned to itself and folds back to
  // exactly where it started.
  const bar = { x: 1200, y: 300, width: BAR.width, height: BAR.height };
  const opened = { ...expandOrigin(bar, WIN, SCREEN), ...WIN };
  const folded = collapseOrigin(opened, BAR, SCREEN);
  assert.deepEqual(folded, { x: bar.x, y: bar.y });
});

test("a window in the middle settles after one fold", () => {
  // Nothing forces the first fold to stay put — but the second cycle must.
  const bar = { x: 700, y: 200, width: BAR.width, height: BAR.height };
  const opened = { ...expandOrigin(bar, WIN, SCREEN), ...WIN };
  const folded = collapseOrigin(opened, BAR, SCREEN);

  const reopened = {
    ...expandOrigin(
      { ...folded, width: BAR.width, height: BAR.height },
      WIN,
      SCREEN,
    ),
    ...WIN,
  };
  assert.deepEqual(reopened, opened, "the window must not walk");
  assert.deepEqual(collapseOrigin(reopened, BAR, SCREEN), folded);
});

test("placement follows the display the window is actually on", () => {
  // A second monitor to the right: "the right half" is that monitor's half.
  const second = { x: 1920, y: 0, width: 1920, height: 1080 };
  const bar = { x: 2000, y: 50, width: BAR.width, height: BAR.height };
  assert.deepEqual(expandOrigin(bar, WIN, second), { x: 2000, y: 50 });

  const nearEdge = { x: 3200, y: 50, width: BAR.width, height: BAR.height };
  assert.deepEqual(expandOrigin(nearEdge, WIN, second), { x: 2800, y: 50 });
});

test("a bar at the bottom is pushed up until the window fits", () => {
  // Growing downwards from 1032 would end at 1732 on a 1080 screen and leave
  // the whole app below the desktop.
  const bar = { x: 200, y: 1032, width: BAR.width, height: BAR.height };
  const at = expandOrigin(bar, WIN, SCREEN);
  assert.deepEqual(at, { x: 200, y: 380 });
  assert.equal(at.y + WIN.height, SCREEN.y + SCREEN.height);
});

test("a taskbar takes its strip out of the work area", () => {
  // workArea, not the whole display: the window may not sit under the taskbar.
  const withTaskbar = { x: 0, y: 0, width: 1920, height: 1032 };
  const bar = { x: 100, y: 900, width: BAR.width, height: BAR.height };
  assert.deepEqual(expandOrigin(bar, WIN, withTaskbar), { x: 100, y: 332 });
});

test("a window larger than the display gets the near corner", () => {
  // No placement fits. Hanging off the far edge would hide the title bar and
  // with it the only way to move the window back.
  const small = { x: 0, y: 0, width: 800, height: 600 };
  const bar = { x: 100, y: 100, width: BAR.width, height: BAR.height };
  assert.deepEqual(expandOrigin(bar, WIN, small), { x: 0, y: 0 });
});

test("the bar cannot be folded off the edge either", () => {
  const offRight = { x: 1500, y: 1050, width: WIN.width, height: WIN.height };
  const at = collapseOrigin(offRight, BAR, SCREEN);
  assert.ok(at.x + BAR.width <= SCREEN.width, `x=${at.x}`);
  assert.ok(at.y + BAR.height <= SCREEN.height, `y=${at.y}`);
});
