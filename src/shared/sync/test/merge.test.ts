/**
 * Who wins when two versions of a row meet, and what a pull leaves behind.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { toRow, remoteWins, mergeIncoming } from "#shared/sync.js";
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
    stateAt: over.stateAt ?? over.updatedAt ?? 1000,
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

/* ------------------------------------------------ a burial is not undone */

// The scenario in three lines, the same one in every direction below: one
// device purges a task, the other -- which has not seen that yet -- trashes
// it. Trashing is newer, so the state half is the trasher's, and the state
// half is where the burial lives. Without the rule the task is alive again on
// both devices, and its text is gone: the content half came from the side
// that buried it, and burying is what emptied the text.

test("a purge survives a later trash arriving from the server", () => {
  const local = [task({ deletedAt: 6000, stateAt: 6000, updatedAt: 1000 })];
  const rows = [
    toRow(
      task({
        text: "",
        memo: null,
        purgedAt: 5000,
        updatedAt: 5000,
        stateAt: 5000,
      }),
      "u1",
    ),
  ];

  const merged = mergeIncoming(local, rows).tasks[0];

  assert.equal(merged.purgedAt, 5000);
  assert.equal(merged.text, "");
});

test("a purge survives a later trash held locally", () => {
  const local = [
    task({ text: "", purgedAt: 5000, updatedAt: 5000, stateAt: 5000 }),
  ];
  const rows = [
    toRow(task({ deletedAt: 6000, stateAt: 6000, updatedAt: 1000 }), "u1"),
  ];

  const merged = mergeIncoming(local, rows).tasks[0];

  assert.equal(merged.purgedAt, 5000);
});

test("a purge survives a row that is newer in both halves", () => {
  // Both halves go to the server copy, which is the path that returns it
  // whole. The burial has to be put back by hand or this shortcut loses it --
  // and this is the shape a device that has been offline for a while sends.
  const local = [
    task({ text: "", purgedAt: 5000, updatedAt: 5000, stateAt: 5000 }),
  ];
  const rows = [
    toRow(
      task({
        text: "살아있다",
        deletedAt: 9000,
        updatedAt: 9000,
        stateAt: 9000,
      }),
      "u1",
    ),
  ];

  const merged = mergeIncoming(local, rows).tasks[0];

  assert.equal(merged.purgedAt, 5000);
});

test("a burial arrives even when the local row is newer in both halves", () => {
  // The fast path in mergeIncoming returns the local row untouched when the
  // server has nothing newer. A burial is not a half and does not race, so it
  // has to come through anyway -- otherwise this device goes on showing a task
  // everybody else destroyed, for as long as its stamps stay ahead.
  const local = [task({ text: "살아있다", updatedAt: 9000, stateAt: 9000 })];
  const rows = [
    toRow(
      task({ text: "", purgedAt: 5000, updatedAt: 5000, stateAt: 5000 }),
      "u1",
    ),
  ];

  const merged = mergeIncoming(local, rows).tasks[0];

  assert.equal(merged.purgedAt, 5000);
});

test("a grave keeps none of the words the newer half was carrying", () => {
  // Restoring the tombstone while taking the newer content puts back exactly
  // what the purge destroyed. Invisible -- every view filters a purged row out
  // -- and stored, on every device and on the server, for the tombstone's
  // ninety days.
  const local = [
    task({
      text: "",
      memo: null,
      purgedAt: 5000,
      updatedAt: 5000,
      stateAt: 5000,
    }),
  ];
  const rows = [
    toRow(
      task({
        text: "살아있다",
        memo: "지워졌어야 하는 메모",
        deletedAt: 9000,
        updatedAt: 9000,
        stateAt: 9000,
      }),
      "u1",
    ),
  ];

  const merged = mergeIncoming(local, rows).tasks[0];

  assert.equal(merged.purgedAt, 5000);
  assert.equal(merged.text, "");
  assert.equal(merged.memo, null);
});

test("a stale edit cannot resurrect a tombstone", () => {
  const local = [task({ text: "", purgedAt: 5000, updatedAt: 5000 })];
  const rows = [toRow(task({ text: "살아있다", updatedAt: 4000 }), "u1")];

  const merged = mergeIncoming(local, rows).tasks[0];

  assert.equal(merged.purgedAt, 5000);
  assert.equal(merged.text, "");
});

/* ------------------------------------------- the two halves, and their point */

/**
 * The case the split exists for. Complete a task on one device, write a memo
 * on another before the completion arrives, and a whole-row merge hands the
 * memo's row the win -- taking the empty completion it never touched with it.
 * The task comes back to life on both devices and nobody is told.
 */
test("a memo written elsewhere does not undo a completion made here", () => {
  const local = [
    task({ id: "t1", completedAt: 2000, stateAt: 2000, updatedAt: 1000 }),
  ];
  const rows = [
    toRow(
      task({ id: "t1", memo: "초안 먼저", updatedAt: 3000, stateAt: 1000 }),
      "u1",
    ),
  ];

  const merged = mergeIncoming(local, rows).tasks[0];

  assert.equal(merged.memo, "초안 먼저");
  assert.equal(merged.completedAt, 2000);
});

test("and the same the other way round", () => {
  const local = [
    task({ id: "t1", memo: "초안 먼저", updatedAt: 3000, stateAt: 1000 }),
  ];
  const rows = [
    toRow(
      task({ id: "t1", completedAt: 4000, stateAt: 4000, updatedAt: 1000 }),
      "u1",
    ),
  ];

  const merged = mergeIncoming(local, rows).tasks[0];

  assert.equal(merged.memo, "초안 먼저");
  assert.equal(merged.completedAt, 4000);
});

test("undoing a completion still travels", () => {
  // The reason the state half is a stamp rather than "whoever says completed
  // wins": taking it back has to reach the other device too.
  const local = [task({ id: "t1", completedAt: 2000, stateAt: 2000 })];
  const rows = [
    toRow(task({ id: "t1", completedAt: null, stateAt: 5000 }), "u1"),
  ];

  assert.equal(mergeIncoming(local, rows).tasks[0].completedAt, null);
});

test("a deletion beats an older completion, and keeps the newer memo", () => {
  const local = [
    task({ id: "t1", memo: "여기서 쓴 메모", updatedAt: 6000, stateAt: 2000 }),
  ];
  const rows = [
    toRow(task({ id: "t1", deletedAt: 4000, stateAt: 4000 }), "u1"),
  ];

  const merged = mergeIncoming(local, rows).tasks[0];

  assert.equal(merged.deletedAt, 4000);
  assert.equal(merged.memo, "여기서 쓴 메모");
});

test("two devices editing the same half still settle on one of them", () => {
  // The split buys the case where each side changed a different half. It does
  // not pretend to merge two memos, and the loser is still the loser.
  const local = [task({ id: "t1", memo: "여기", updatedAt: 2000 })];
  const rows = [toRow(task({ id: "t1", memo: "저기", updatedAt: 3000 }), "u1")];

  assert.equal(mergeIncoming(local, rows).tasks[0].memo, "저기");
});

test("a row written before the split behaves exactly as it used to", () => {
  // No state stamp at all: content and state move together, which is what one
  // stamp for the whole row meant.
  const legacy = { ...task({ id: "t1", completedAt: 2000, updatedAt: 2000 }) };
  delete (legacy as Partial<Task>).stateAt;
  const rows = [toRow({ id: "t1", memo: "나중 것", updatedAt: 3000 }, "u1")];

  const merged = mergeIncoming([legacy], rows).tasks[0];

  assert.equal(merged.memo, "나중 것");
  assert.equal(merged.completedAt, null);
});

test("nothing newer in either half leaves the local row alone", () => {
  const local = [
    task({ id: "t1", memo: "여기", updatedAt: 5000, stateAt: 5000 }),
  ];
  const rows = [
    toRow(
      task({ id: "t1", memo: "저기", updatedAt: 1000, stateAt: 1000 }),
      "u1",
    ),
  ];

  const { tasks, applied, kept } = mergeIncoming(local, rows);

  assert.equal(tasks[0].memo, "여기");
  assert.deepEqual(applied, []);
  assert.deepEqual(kept, ["t1"]);
});

test("the state winner's stamp survives even when it never had one", () => {
  // The row that wins the state half predates the split, so its stamp is its
  // content stamp. Copying the absent field would leave the merged row with
  // none, and normalizeTasks would fill it from the *content* winner's
  // stamp -- a number from another device's clock, and a later one. A real
  // state change in between would then arrive looking stale.
  const local = [task({ id: "t1", memo: "여기", updatedAt: 200, stateAt: 50 })];
  const legacy = {
    id: "t1",
    text: "할 일",
    quadrant: "q1" as Place,
    updatedAt: 100,
  };
  const rows = [toRow(legacy, "u1")];

  const merged = mergeIncoming(local, rows).tasks[0];

  assert.equal(merged.memo, "여기");
  assert.equal(merged.stateAt, 100);
});

test("and a state change after it still wins", () => {
  // The point of the one above: 150 has to beat what the merge wrote, and it
  // would not if the merge had written 200.
  const local = [task({ id: "t1", memo: "여기", updatedAt: 200, stateAt: 50 })];
  const legacy = {
    id: "t1",
    text: "할 일",
    quadrant: "q1" as Place,
    updatedAt: 100,
  };
  const after = mergeIncoming(local, [toRow(legacy, "u1")]).tasks;

  const done = [
    toRow(task({ id: "t1", completedAt: 150, stateAt: 150 }), "u1"),
  ];
  assert.equal(mergeIncoming(after, done).tasks[0].completedAt, 150);
});
