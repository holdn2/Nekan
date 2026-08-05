const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PAGE_SIZE,
  toRow,
  fromRow,
  remoteWins,
  mergeIncoming,
  pendingChanges,
  pushedThrough,
  nextCursor,
  hasMore,
} = require("../src/shared/sync");

function task(over = {}) {
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

/* ------------------------------------------------------------------ shapes */

test("toRow renames every field and keeps the values", () => {
  const row = toRow(
    task({ dueDate: "2026-08-09", memo: "왜 여기 뒀는지" }),
    "u1",
  );

  assert.equal(row.user_id, "u1");
  assert.equal(row.id, "t1");
  assert.equal(row.due_date, "2026-08-09");
  assert.equal(row.order_key, "V");
  assert.equal(row.updated_at, 1000);
  assert.equal(row.memo, "왜 여기 뒀는지");
});

test("toRow never sends server_seq — the server stamps it", () => {
  const row = toRow({ ...task(), server_seq: 999, serverSeq: 999 }, "u1");
  assert.equal("server_seq" in row, false);
});

test("toRow turns a missing field into null rather than dropping it", () => {
  const row = toRow({ id: "t1", updatedAt: 5 }, "u1");
  assert.equal("due_date" in row, true);
  assert.equal(row.due_date, null);
});

test("fromRow round-trips a task", () => {
  const original = task({ completedAt: 2000, memo: "메모" });
  assert.deepEqual(fromRow(toRow(original, "u1")), original);
});

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

test("a stale edit cannot resurrect a tombstone", () => {
  const local = [task({ text: "", purgedAt: 5000, updatedAt: 5000 })];
  const rows = [toRow(task({ text: "살아있다", updatedAt: 4000 }), "u1")];

  const merged = mergeIncoming(local, rows).tasks[0];

  assert.equal(merged.purgedAt, 5000);
  assert.equal(merged.text, "");
});

/* ------------------------------------------------------------------ queues */

test("pendingChanges takes everything on a first sync", () => {
  const tasks = [task({ id: "a" }), task({ id: "b", updatedAt: 1 })];
  assert.equal(pendingChanges(tasks, 0).length, 2);
  assert.equal(pendingChanges(tasks, undefined).length, 2);
});

test("pendingChanges leaves out what was already sent", () => {
  const tasks = [
    task({ id: "old", updatedAt: 100 }),
    task({ id: "new", updatedAt: 300 }),
  ];

  assert.deepEqual(
    pendingChanges(tasks, 200).map((t) => t.id),
    ["new"],
  );
});

test("pendingChanges includes the boundary rather than risk losing it", () => {
  const tasks = [task({ id: "edge", updatedAt: 200 })];
  assert.deepEqual(
    pendingChanges(tasks, 200).map((t) => t.id),
    ["edge"],
  );
});

test("pushedThrough advances to the newest row sent", () => {
  const pending = [task({ updatedAt: 100 }), task({ updatedAt: 400 })];
  assert.equal(pushedThrough(pending, 50), 400);
});

test("pushedThrough never goes backwards on an empty push", () => {
  assert.equal(pushedThrough([], 700), 700);
});

/* ------------------------------------------------------------------ cursor */

test("nextCursor moves to the largest server_seq in the batch", () => {
  const rows = [{ server_seq: 12 }, { server_seq: 40 }, { server_seq: 31 }];
  assert.equal(nextCursor(rows, 5), 40);
});

test("nextCursor holds still on an empty page instead of replaying", () => {
  assert.equal(nextCursor([], 91823), 91823);
  assert.equal(nextCursor(undefined, 91823), 91823);
});

test("nextCursor cannot be dragged backwards by a stale row", () => {
  assert.equal(nextCursor([{ server_seq: 3 }], 500), 500);
});

/* ------------------------------------------------------------------- pages */

test("a full page means there is more behind it", () => {
  assert.equal(hasMore(new Array(3).fill({}), 3), true);
  assert.equal(hasMore(new Array(PAGE_SIZE).fill({})), true);
});

test("a short page is the end", () => {
  assert.equal(hasMore(new Array(2).fill({}), 3), false);
  assert.equal(hasMore([], 3), false);
  assert.equal(hasMore(undefined), false);
});

test("a full first sync is walked to the end, oldest rows included", () => {
  // Server side: ten rows, handed out three at a time in cursor order.
  const server = Array.from({ length: 10 }, (_, i) => ({
    id: `t${i}`,
    updated_at: 1000 + i,
    server_seq: (i + 1) * 7,
  }));
  const serve = (since, limit) =>
    server.filter((r) => r.server_seq > since).slice(0, limit);

  let cursor = 0;
  let tasks = [];
  let rounds = 0;
  let rows;
  do {
    rows = serve(cursor, 3);
    tasks = mergeIncoming(tasks, rows).tasks;
    cursor = nextCursor(rows, cursor);
    rounds += 1;
  } while (hasMore(rows, 3) && rounds < 20);

  assert.equal(tasks.length, 10);
  // The oldest row is the one a loop that stops early silently drops.
  assert.equal(tasks[0].id, "t0");
  assert.equal(cursor, 70);
  // Four rounds for ten rows: 3 + 3 + 3 + 1, the short page ending it.
  assert.equal(rounds, 4);
});

test("a first sync whose total lands exactly on a page boundary still ends", () => {
  const server = Array.from({ length: 6 }, (_, i) => ({
    id: `t${i}`,
    updated_at: 1000 + i,
    server_seq: i + 1,
  }));
  const serve = (since, limit) =>
    server.filter((r) => r.server_seq > since).slice(0, limit);

  let cursor = 0;
  let tasks = [];
  let rounds = 0;
  let rows;
  do {
    rows = serve(cursor, 3);
    tasks = mergeIncoming(tasks, rows).tasks;
    cursor = nextCursor(rows, cursor);
    rounds += 1;
  } while (hasMore(rows, 3) && rounds < 20);

  assert.equal(tasks.length, 6);
  // 3 + 3 + 0: the empty round is the cost of not being able to tell a full
  // last page from a full middle one.
  assert.equal(rounds, 3);
});
