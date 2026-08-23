/**
 * A task as a row and back, field by field.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { toRow, fromRow } from "#shared/sync.js";
import type { LooseTask } from "#shared/sync.js";
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
  // Fields toRow has never heard of, on purpose: the point is that it sends
  // the columns FIELDS names and not whatever a caller happened to attach.
  const row = toRow(
    { ...task(), server_seq: 999, serverSeq: 999 } as LooseTask,
    "u1",
  );
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
  // Rubbish stamps, which is exactly the case being tested -- a row that never
  // went through normalizeTasks would carry one.
  const bads = [{}, { updatedAt: null }, { updatedAt: "어제" }] as unknown[];
  for (const bad of bads) {
    const row = toRow({ id: "t1", ...(bad as object) } as LooseTask, "u1");
    assert.equal(typeof row.updated_at, "number", JSON.stringify(bad));
  }
  assert.equal(toRow({ id: "t1", updatedAt: 5 }, "u1").updated_at, 5);
});

test("fromRow round-trips a task", () => {
  const original = task({ completedAt: 2000, memo: "메모" });
  assert.deepEqual(fromRow(toRow(original, "u1")), original);
});
