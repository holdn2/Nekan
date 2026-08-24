/**
 * What still has to go up, how far a pull read, and when a page is the last one.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  mergeIncoming,
  pendingChanges,
  pushedThrough,
  nextCursor,
  hasMore,
  PAGE_SIZE,
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
