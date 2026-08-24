/**
 * Normalising a stored list back into tasks, and the tombstones that outlive one.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  QUADS,
  INBOX,
  PLACES,
  SPACES,
  DEFAULT_SPACE,
  normalizeTasks,
  TOMBSTONE_TTL_MS,
  dropExpiredTombstones,
} from "#shared/core.js";
import type { Place, Task } from "#shared/types.js";

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
    assert.ok(
      (QUADS as Place[]).includes(task.quadrant),
      `${task.id} landed outside QUADS`,
    );
  }
});

test("normalizeTasks keeps a task parked in the inbox there", () => {
  // The inbox is a fifth legal place, not a bad quadrant to be repaired — a
  // brain dump must survive a restart without being swept into q4.
  const [task] = normalizeTasks([{ id: "a", text: "x", quadrant: INBOX }]);
  assert.equal(task.quadrant, INBOX);
  assert.ok(PLACES.includes(INBOX));
  assert.ok(
    !(QUADS as Place[]).includes(INBOX),
    "the grid loops must not walk the inbox",
  );
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
  // Deliberately rubbish: the point is that a purgedAt nothing can parse is
  // kept rather than dropped, so the fixture has to be allowed to say it.
  const list = [
    { id: "a", purgedAt: "yesterday" },
    { id: "b" },
  ] as unknown as Partial<Task>[];
  assert.equal(dropExpiredTombstones(list, now).length, 2);
  assert.deepEqual(dropExpiredTombstones(null, now), []);
});
