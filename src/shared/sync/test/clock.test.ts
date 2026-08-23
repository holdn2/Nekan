/**
 * Measuring how far this machine's clock is from the server's.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  pendingChanges,
  unsentChanges,
  clockOffset,
  nextOffset,
  CLOCK_TOLERANCE_MS,
} from "#shared/sync.js";
import type { Task } from "#shared/types.js";

function task(over: Partial<Task> = {}): Task {
  return {
    id: "t1",
    text: "할 일",
    quadrant: "q1",
    space: "work",
    dueDate: null,
    memo: null,
    orderKey: "V",
    createdAt: 1000,
    updatedAt: 1000,
    completedAt: null,
    deletedAt: null,
    purgedAt: null,
    ...over,
  };
}

/* ------------------------------------------------------------------- clock */

test("clockOffset reads how far this machine is behind the server", () => {
  // A Date header is RFC 1123 and has one-second resolution. This machine
  // thinks it is 12:00:00; the server says 12:10:00.
  const ours = Date.parse("Thu, 06 Aug 2026 12:00:00 GMT");

  assert.equal(
    clockOffset("Thu, 06 Aug 2026 12:10:00 GMT", ours),
    10 * 60 * 1000,
  );
  assert.equal(
    clockOffset("Thu, 06 Aug 2026 11:50:00 GMT", ours),
    -10 * 60 * 1000,
  );
});

test("an unreadable Date is NaN, not zero", () => {
  // The difference is load-bearing. Zero is a real measurement -- the clocks
  // agree -- so returning it for "no idea" made a header-less reply look like
  // a correction back to zero.
  assert.equal(Number.isNaN(clockOffset(null, 1000)), true);
  assert.equal(Number.isNaN(clockOffset("", 1000)), true);
  assert.equal(Number.isNaN(clockOffset("어제쯤", 1000)), true);
});

test("a header-less reply cannot wipe an offset already learned", () => {
  // The whole point of the NaN above: a device ten minutes out must not throw
  // that away because one proxy or error path answered without a Date.
  const learned = nextOffset(0, 600_000);
  assert.equal(learned, 600_000);
  assert.equal(nextOffset(learned, clockOffset(null, Date.now())), 600_000);
});

test("nextOffset ignores samples too small to be real", () => {
  // The header has one-second resolution and was written before the body was
  // sent, so every sample is a little off. Adopting that jitter would make the
  // order of two edits depend on which reply happened to arrive first.
  assert.equal(nextOffset(0, 900), 0);
  assert.equal(nextOffset(0, -1999), 0);
  assert.equal(nextOffset(5000, 5500), 5000);
});

test("nextOffset adopts a sample that is genuinely different", () => {
  assert.equal(nextOffset(0, CLOCK_TOLERANCE_MS), CLOCK_TOLERANCE_MS);
  assert.equal(nextOffset(0, 600_000), 600_000);
  // Including one that goes back towards zero: a clock that has just been
  // corrected by the OS must stop being compensated for.
  assert.equal(nextOffset(600_000, 0), 0);
});

test("a missing sample keeps the offset in hand", () => {
  assert.equal(nextOffset(600_000, NaN), 600_000);
  assert.equal(nextOffset(NaN, 900), 0);
});

/* ----------------------------------------------------------------- unsent */

test("unsentChanges is strict where pendingChanges is inclusive", () => {
  // The difference is the whole point of having both. pendingChanges re-sends
  // the boundary row to be safe; showing that row as "1개 대기" would leave the
  // chip saying so forever after every successful sync.
  const tasks = [task({ id: "edge", updatedAt: 200 })];

  assert.equal(pendingChanges(tasks, 200).length, 1);
  assert.equal(unsentChanges(tasks, 200).length, 0);
});

test("unsentChanges counts what really has not gone up", () => {
  const tasks = [
    task({ id: "sent", updatedAt: 100 }),
    task({ id: "typing", updatedAt: 300 }),
    task({ id: "also", updatedAt: 301 }),
  ];

  assert.deepEqual(
    unsentChanges(tasks, 200).map((t) => t.id),
    ["typing", "also"],
  );
});

test("unsentChanges before a first sync is everything", () => {
  const tasks = [task({ id: "a" }), task({ id: "b" })];
  assert.equal(unsentChanges(tasks, 0).length, 2);
  assert.equal(unsentChanges(tasks, undefined).length, 2);
});

test("unsentChanges survives a missing list", () => {
  assert.deepEqual(unsentChanges(null, 0), []);
});
