/**
 * Who wins when two versions of a row meet, and what a pull leaves behind.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { toRow, stamp, remoteWins, mergeIncoming } from "#shared/sync.js";
import type { Place, Task } from "#shared/types.js";

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

/* --------------------------------------------------------------- tie rules */

test("the newer side wins", () => {
  assert.equal(
    remoteWins(task({ updatedAt: 1 }), task({ updatedAt: 2 })),
    true,
  );
  assert.equal(
    remoteWins(task({ updatedAt: 2 }), task({ updatedAt: 1 })),
    false,
  );
});

test("a tie goes to the server, or two devices never converge", () => {
  assert.equal(
    remoteWins(task({ updatedAt: 7 }), task({ updatedAt: 7 })),
    true,
  );
});

test("a task with no stamp loses to one that has one", () => {
  assert.equal(
    remoteWins(task({ updatedAt: undefined }), task({ updatedAt: 1 })),
    true,
  );
  assert.equal(
    remoteWins(task({ updatedAt: 1 }), task({ updatedAt: undefined })),
    false,
  );
});

/* ------------------------------------------------------------------- merge */

test("mergeIncoming takes a newer row and reports it", () => {
  const local = [task({ text: "옛날" })];
  const rows = [toRow(task({ text: "새것", updatedAt: 2000 }), "u1")];

  const out = mergeIncoming(local, rows);

  assert.equal(out.tasks.length, 1);
  assert.equal(out.tasks[0].text, "새것");
  assert.deepEqual(out.applied, ["t1"]);
  assert.deepEqual(out.kept, []);
});

test("mergeIncoming keeps a locally newer row and says so", () => {
  const local = [task({ text: "여기가 최신", updatedAt: 3000 })];
  const rows = [toRow(task({ text: "서버 옛것", updatedAt: 2000 }), "u1")];

  const out = mergeIncoming(local, rows);

  assert.equal(out.tasks[0].text, "여기가 최신");
  assert.deepEqual(out.applied, []);
  assert.deepEqual(out.kept, ["t1"]);
});

test("mergeIncoming appends a task this device has never seen", () => {
  const out = mergeIncoming(
    [task()],
    [toRow(task({ id: "t2", text: "다른 기기에서" }), "u1")],
  );

  assert.deepEqual(
    out.tasks.map((t) => t.id),
    ["t1", "t2"],
  );
  assert.deepEqual(out.applied, ["t2"]);
});

test("mergeIncoming does not mutate the array it was given", () => {
  const local = [task()];
  const out = mergeIncoming(local, [toRow(task({ updatedAt: 9000 }), "u1")]);

  assert.equal(local[0].updatedAt, 1000);
  assert.notEqual(out.tasks, local);
});

test("mergeIncoming keeps local order and appends the rest", () => {
  const local = [task({ id: "a" }), task({ id: "b" }), task({ id: "c" })];
  const rows = [
    toRow(task({ id: "c", updatedAt: 9000 }), "u1"),
    toRow(task({ id: "z", updatedAt: 9000 }), "u1"),
  ];

  assert.deepEqual(
    mergeIncoming(local, rows).tasks.map((t) => t.id),
    ["a", "b", "c", "z"],
  );
});

test("an incoming tombstone replaces the row it buries", () => {
  const local = [task({ text: "지울 것", memo: "메모" })];
  const rows = [
    toRow(
      task({ text: "", memo: null, purgedAt: 5000, updatedAt: 5000 }),
      "u1",
    ),
  ];

  const merged = mergeIncoming(local, rows).tasks[0];

  assert.equal(merged.purgedAt, 5000);
  assert.equal(merged.text, "");
  assert.equal(merged.memo, null);
});

test("an inbox row arriving with a space has it stripped", () => {
  // Another device -- or an older build of this one -- can write a row that
  // breaks the rule. Letting it in shows the task on one board only.
  const rows = [
    toRow(task({ id: "bad", quadrant: "inbox", space: "work" }), "u1"),
  ];

  const merged = mergeIncoming([], rows).tasks[0];

  assert.equal(merged.quadrant, "inbox");
  assert.equal(merged.space, null);
});

test("a quadrant row arriving without a space is given one", () => {
  const rows = [toRow(task({ id: "bad", quadrant: "q1", space: null }), "u1")];
  assert.notEqual(mergeIncoming([], rows).tasks[0].space, null);
});

test("a row with an impossible quadrant is filed somewhere real", () => {
  // "q9" is not a place, which is the whole point: the merge has to file it
  // somewhere real rather than keep it.
  const rows = [toRow(task({ id: "bad", quadrant: "q9" as Place }), "u1")];
  const merged = mergeIncoming([], rows).tasks[0];
  assert.notEqual(merged.quadrant, "q9");
});

test("a row arriving without an orderKey is given one", () => {
  const rows = [toRow(task({ id: "bad", orderKey: null }), "u1")];
  const merged = mergeIncoming([], rows).tasks[0];
  assert.equal(typeof merged.orderKey, "string");
  assert.notEqual(merged.orderKey, "");
});

test("a stale edit cannot resurrect a tombstone", () => {
  const local = [task({ text: "", purgedAt: 5000, updatedAt: 5000 })];
  const rows = [toRow(task({ text: "살아있다", updatedAt: 4000 }), "u1")];

  const merged = mergeIncoming(local, rows).tasks[0];

  assert.equal(merged.purgedAt, 5000);
  assert.equal(merged.text, "");
});
