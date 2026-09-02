/**
 * Every write the phone can make.
 *
 * Three rules carry over from the desktop and none of them are optional:
 *
 * A task is never removed from the array. Its state is four timestamps, and
 * "permanently deleted" is a tombstone -- a row that stays with its text
 * emptied. Deleting the row instead would let another device that has not
 * synced yet push it straight back.
 *
 * `space` is decided in exactly one place, `spaceFor()`, and is null exactly
 * when the task is in the brain dump. That null is what makes the dump shared
 * between the two boards, so dropping out of it is the moment a task acquires
 * a board.
 *
 * Order is `orderKey`, never position. A move writes one key rather than
 * rewriting a list, and two keys from different quadrants are not comparable.
 */
import { INBOX, orderKeyBetween, spaceFor } from "@nekan/shared/core";
import type { Place, Task } from "@nekan/shared/types";
import { activeOf } from "./selectors";
import { commit, currentSpace, findTask, insertTask, now, uid } from "./state";

/** The key that lands a row after everything already in `quadrant`. */
function tailKey(quadrant: Place): string {
  const rows = activeOf(quadrant);
  return orderKeyBetween(rows.length ? rows[rows.length - 1].orderKey : null);
}

/** The key that lands a row before everything -- where a dropped card goes. */
function headKey(quadrant: Place): string {
  const rows = activeOf(quadrant);
  return orderKeyBetween(null, rows.length ? rows[0].orderKey : null);
}

function makeTask(quadrant: Place, text: string): Task {
  const at = now();
  return {
    id: uid(),
    text,
    quadrant,
    // In a quadrant it belongs to the board on screen; in the dump it belongs
    // to neither yet, and spaceFor answers null for exactly that case.
    space: spaceFor(quadrant, currentSpace()),
    dueDate: null,
    memo: null,
    // Computed before the row joins the array: tailKey reads the rows it is
    // about to sit behind.
    orderKey: tailKey(quadrant),
    createdAt: at,
    updatedAt: at,
    completedAt: null,
    deletedAt: null,
    purgedAt: null,
  };
}

/**
 * Add one or many. A pasted block becomes one task per line, because that is
 * what pasting a list into the dump means; blank lines are dropped rather than
 * becoming empty rows.
 */
export function addTasks(quadrant: Place, text: string): number {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) insertTask(makeTask(quadrant, line));
  if (lines.length) commit();
  return lines.length;
}

/** Empty text deletes rather than storing a blank row -- same as the desktop. */
export function editTask(id: string, text: string): void {
  const task = findTask(id);
  if (!task) return;
  const next = text.trim();
  if (!next) return deleteTask(id);
  if (next === task.text) return;
  task.text = next;
  commit(task);
}

export function setMemo(id: string, memo: string | null): void {
  const task = findTask(id);
  if (!task) return;
  const next = memo && memo.trim() ? memo : null;
  if (next === task.memo) return;
  task.memo = next;
  commit(task);
}

export function setDue(id: string, value: string | null): void {
  const task = findTask(id);
  if (!task || task.dueDate === value) return;
  task.dueDate = value;
  commit(task);
}

export function completeTask(id: string): void {
  const task = findTask(id);
  if (!task || task.completedAt) return;
  task.completedAt = now();
  commit(task);
}

export function restoreTask(id: string): void {
  const task = findTask(id);
  if (!task || !task.completedAt) return;
  task.completedAt = null;
  commit(task);
}

export function deleteTask(id: string): void {
  const task = findTask(id);
  if (!task || task.deletedAt) return;
  task.deletedAt = now();
  commit(task);
}

export function untrashTask(id: string): void {
  const task = findTask(id);
  if (!task || !task.deletedAt) return;
  task.deletedAt = null;
  commit(task);
}

/**
 * Move a task into a quadrant, above `beforeId`.
 *
 * `null` means the end of the list, which is the honest reading: there is no
 * row after it. That matters because a drop below the last row is the only way
 * to make something last, and reading null as "nowhere" made that impossible.
 */
export function moveTask(
  id: string,
  quadrant: Place,
  beforeId: string | null,
): void {
  const task = findTask(id);
  if (!task || id === beforeId) return;

  // Destination first: the neighbours are read out of that quadrant, and the
  // moving row has to be excluded from its own placement.
  task.quadrant = quadrant;
  task.space = spaceFor(quadrant, currentSpace());

  const siblings = activeOf(quadrant).filter((t) => t.id !== id);
  const at = beforeId ? siblings.findIndex((t) => t.id === beforeId) : -1;
  const after = at === -1 ? null : siblings[at];
  const before = at === -1 ? siblings[siblings.length - 1] : siblings[at - 1];
  task.orderKey = orderKeyBetween(before?.orderKey, after?.orderKey);
  commit(task);
}

/**
 * Move a task and put it first.
 *
 * What a card drop does. The four cards show counts rather than rows, so a
 * drop names a quadrant and nothing else -- and the row you just moved should
 * be the first thing you see when you open it, not the last.
 */
export function moveToTop(id: string, quadrant: Place): void {
  const task = findTask(id);
  if (!task) return;
  task.quadrant = quadrant;
  task.space = spaceFor(quadrant, currentSpace());
  task.orderKey = headKey(quadrant);
  commit(task);
}

/** Back to the dump, which also takes its board away again. */
export const unfileTask = (id: string) => moveToTop(id, INBOX);

/**
 * Permanent for the person, a tombstone in the file.
 *
 * The row stays in the array with its text and memo emptied. Removing it would
 * let another device that has not synced yet push the task straight back in --
 * a deletion has to be something the file can state, not something it forgets.
 */
function tombstone(task: Task): void {
  task.purgedAt = now();
  task.text = "";
  task.memo = null;
}

export function purgeTask(id: string): void {
  const task = findTask(id);
  if (!task) return;
  tombstone(task);
  commit(task);
}

/**
 * The three that act on a whole tab.
 *
 * Each takes the rows the tab is already showing rather than filtering the
 * array again. The tab has applied the active board; filtering here a second
 * time would reach the other one, and the person would lose a list they cannot
 * even see.
 */
export function trashAll(items: Task[]): void {
  if (!items.length) return;
  const at = now();
  for (const t of items) t.deletedAt = at;
  commit(...items);
}

export function untrashAll(items: Task[]): void {
  if (!items.length) return;
  for (const t of items) t.deletedAt = null;
  commit(...items);
}

export function purgeAll(items: Task[]): void {
  if (!items.length) return;
  for (const t of items) tombstone(t);
  commit(...items);
}
