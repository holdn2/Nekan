/**
 * A task as a row, and a row as a task.
 *
 * FIELDS is the spec: which columns exist and what each is called on the two
 * sides. Naming them anywhere else as well would let the two drift, so the
 * converters below read this list rather than spelling anything out.
 */

import type { Task } from "../types.js";

/**
 * A task as the server stores it: snake_case columns, and `user_id` on every
 * one because RLS matches on it.
 *
 * Loose on purpose -- FIELDS below is the real spec of which columns exist, and
 * naming them twice would let the two drift. What the type is here to say is
 * that the column names are strings and the values are JSON, not that a row is
 * a Task; `server_seq` is the clearest case, since the server stamps it and
 * ignores anything a client sends.
 */
export interface Row {
  user_id: string;
  id: string;
  [column: string]: string | number | null | undefined;
}

/**
 * A task on its way to or from the server: every field optional, because a row
 * written by another device -- possibly an older build -- has not been checked
 * by anything yet. mergeIncoming normalizes before handing it on, and that is
 * the moment it becomes a Task.
 */
export type LooseTask = Partial<Task> & { id: string };

/** Column names, in the order the row object is built. JS is camel, SQL snake. */
const FIELDS: ReadonlyArray<readonly [keyof Task, string]> = [
  ["text", "text"],
  ["quadrant", "quadrant"],
  ["space", "space"],
  ["dueDate", "due_date"],
  ["memo", "memo"],
  ["orderKey", "order_key"],
  ["createdAt", "created_at"],
  ["updatedAt", "updated_at"],
  ["stateAt", "state_at"],
  ["completedAt", "completed_at"],
  ["deletedAt", "deleted_at"],
  ["purgedAt", "purged_at"],
];

/** A missing or unparseable stamp sorts before every real one. */
export function stamp(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * A task's state stamp, falling back to its content stamp.
 *
 * Rows written before `stateAt` existed carried one stamp for the whole row,
 * and reading them this way is what keeps them meaning that. Every comparison
 * of state goes through here rather than reading the field, because a row from
 * another device may be one of those.
 */
export function stateStamp(task: LooseTask): number {
  return Number.isFinite(task.stateAt)
    ? (task.stateAt as number)
    : stamp(task.updatedAt);
}

/**
 * The last time anything on a task changed, either half.
 *
 * What the push watermark is measured against. `updatedAt` alone would miss a
 * task that was only completed, and it would never be sent.
 */
export function changedAt(task: LooseTask): number {
  return Math.max(stamp(task.updatedAt), stateStamp(task));
}

/** Task -> the row shape the server stores. `userId` is the caller's own. */
export function toRow(task: LooseTask, userId: string): Row {
  const row: Row = { user_id: userId, id: String(task.id) };
  for (const [key, column] of FIELDS) {
    const value = task[key];
    row[column] = value === undefined ? null : (value as Row[string]);
  }
  // updated_at is the one column the table refuses to take a null for, and its
  // DEFAULT cannot save us: Postgres only applies a default when the column is
  // *absent*, and every column is present here. A task that never went through
  // normalizeTasks would send null, and the whole batch it travelled in would
  // come back 23502 -- one malformed row is enough to wedge every sync after
  // it, since the push retries the same batch forever.
  row.updated_at = stamp(task.updatedAt);
  // server_seq is deliberately absent: the server stamps it and ignores what a
  // client claims. Sending one would only look like it worked.
  return row;
}

/** The row shape the server stores -> a task the rest of the app understands. */
export function fromRow(row: Row): LooseTask {
  const task = { id: String(row.id) } as LooseTask;
  for (const [key, column] of FIELDS) {
    const value = row[column];
    (task as Record<string, unknown>)[key] = value === undefined ? null : value;
  }
  return task;
}

export { FIELDS };
