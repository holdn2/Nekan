/**
 * The grid's proportions and the floors a drag may not cross.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  sanitizeLayout,
  DEFAULT_LAYOUT,
  MIN_RATIO,
  MAX_RATIO,
  MIN_COL_PX,
  MIN_ROW_PX,
  MIN_INBOX_PX,
  MIN_MEMO_PX,
  clampAxis,
  clampInbox,
  clampMemoPanel,
} from "#shared/core.js";

test("sanitizeLayout clamps ratios into the drag range", () => {
  assert.deepEqual(sanitizeLayout({ cols: 0.01, rows: 0.99 }), {
    cols: MIN_RATIO,
    rows: MAX_RATIO,
    inbox: null,
    memo: null,
  });
  assert.deepEqual(sanitizeLayout({ cols: 0.3, rows: 0.7 }), {
    cols: 0.3,
    rows: 0.7,
    inbox: null,
    memo: null,
  });
});

test("sanitizeLayout keeps a dump height it cannot check the ceiling of", () => {
  // The upper bound depends on the window, which core.js cannot see, so this
  // only enforces the floor. A height saved on a large monitor has to survive
  // the trip to a small one and be clamped where the room is known.
  assert.equal(sanitizeLayout({ inbox: 400 }).inbox, 400);
  assert.equal(sanitizeLayout({ inbox: MIN_INBOX_PX }).inbox, MIN_INBOX_PX);
  assert.equal(sanitizeLayout({ inbox: 240.6 }).inbox, 241);

  for (const junk of [undefined, null, 0, -10, "200", NaN, MIN_INBOX_PX - 1]) {
    assert.equal(sanitizeLayout({ inbox: junk }).inbox, null, String(junk));
  }
});

test("clampInbox holds the floor even when there is no room for it", () => {
  assert.equal(clampInbox(200, 500), 200);
  assert.equal(clampInbox(600, 500), 500);
  assert.equal(clampInbox(10, 500), MIN_INBOX_PX);
  // A window too short to give the list its minimum still gets the minimum:
  // the matrix has its own overflow rules, and a zero-height list reads as a
  // broken panel rather than a small one.
  assert.equal(clampInbox(200, 10), MIN_INBOX_PX);
  assert.equal(clampInbox(NaN, 500), MIN_INBOX_PX);
});

test("sanitizeLayout keeps a note height it cannot check the ceiling of", () => {
  // Same rule as the dump: the ceiling is the matrix's to give, so only the
  // floor is enforced here and a height saved on a large monitor survives.
  assert.equal(sanitizeLayout({ memo: 400 }).memo, 400);
  assert.equal(sanitizeLayout({ memo: MIN_MEMO_PX }).memo, MIN_MEMO_PX);
  assert.equal(sanitizeLayout({ memo: 240.6 }).memo, 241);

  for (const junk of [undefined, null, 0, -10, "200", NaN, MIN_MEMO_PX - 1]) {
    assert.equal(sanitizeLayout({ memo: junk }).memo, null, String(junk));
  }
});

test("clampMemoPanel holds its floor even when there is no room for it", () => {
  assert.equal(clampMemoPanel(240, 500), 240);
  assert.equal(clampMemoPanel(600, 500), 500);
  assert.equal(clampMemoPanel(10, 500), MIN_MEMO_PX);
  assert.equal(clampMemoPanel(240.6, 500), 241);
  // The floor wins over the room, as it does for the dump: the matrix has its
  // own overflow rules, and a panel of no height reads as broken.
  assert.equal(clampMemoPanel(300, 10), MIN_MEMO_PX);
  assert.equal(clampMemoPanel(NaN, 500), MIN_MEMO_PX);
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
    inbox: null,
    memo: null,
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
