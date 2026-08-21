const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CLOCK_TOLERANCE_MS,
  PAGE_SIZE,
  clockOffset,
  nextOffset,
  toRow,
  fromRow,
  remoteWins,
  mergeIncoming,
  pendingChanges,
  unsentChanges,
  pushedThrough,
  nextCursor,
  hasMore,
} = require("../out/shared/sync");

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

test("toRow never sends a null updated_at — the column refuses it", () => {
  // Not hypothetical: the server answers 23502 and rejects the *whole* batch,
  // so one task like this would wedge every sync behind it.
  for (const bad of [{}, { updatedAt: null }, { updatedAt: "어제" }]) {
    const row = toRow({ id: "t1", ...bad }, "u1");
    assert.equal(typeof row.updated_at, "number", JSON.stringify(bad));
  }
  assert.equal(toRow({ id: "t1", updatedAt: 5 }, "u1").updated_at, 5);
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
  const rows = [toRow(task({ id: "bad", quadrant: "q9" }), "u1")];
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
