/**
 * Every change one task can undergo.
 *
 * None of them splices. Completing, trashing and purging are stamps, and
 * purging is a tombstone -- the row stays with its text and memo emptied,
 * because a device that has not synced yet would otherwise push the task
 * straight back.
 *
 * Where a row sits inside a quadrant is its orderKey, not its index, so a move
 * writes one row rather than the whole list.
 */

import type { Place, Task } from "../../shared/types.js";
import { clampText, orderKeyBetween, spaceFor } from "../../shared/core.js";
import {
  allTasks,
  commit,
  findTask,
  getSpace,
  now,
  persist,
  uid,
} from "./state.js";
import { activeOf } from "./selectors.js";

/** The key that lands a new row after everything already in `quadrant`. */
function tailKey(quadrant: Place) {
  const rows = activeOf(quadrant);
  return orderKeyBetween(rows.length ? rows[rows.length - 1].orderKey : null);
}

/** A new task, filed into `quadrant` on the board that is on screen. */
function makeTask(quadrant: Place, text: string, dueDate: string | null): Task {
  const at = now();
  return {
    id: uid(),
    text,
    quadrant,
    // Filed straight into a quadrant, it belongs to the matrix on screen; typed
    // into the inbox, it belongs to neither yet (spaceFor returns null).
    space: spaceFor(quadrant, getSpace()),
    dueDate: dueDate || null,
    memo: null,
    // Read after the row is in `tasks`, so this has to be computed while it is
    // still out: tailKey() looks at the rows it will sit behind.
    orderKey: tailKey(quadrant),
    createdAt: at,
    updatedAt: at,
    completedAt: null,
    deletedAt: null,
    purgedAt: null,
  };
}

/** Add one task; blank text (after trimming) is simply ignored. */
export function addTask(
  quadrant: Place,
  text: string,
  dueDate: string | null = null,
) {
  const trimmed = clampText(text);
  if (!trimmed) return;
  allTasks().push(makeTask(quadrant, trimmed, dueDate));
  commit();
}

/**
 * Bulk add for a pasted brain dump. One save and one render for the whole
 * batch — going through addTask per line would rebuild the DOM for every line
 * of the paste.
 *
 * The tasks are pushed one at a time because each one's key is read off the
 * row before it; building them all first would give the whole paste one key.
 */
export function addTasks(quadrant: Place, texts: string[]) {
  if (!texts.length) return;
  texts.forEach((text: string) =>
    allTasks().push(makeTask(quadrant, text, null)),
  );
  commit();
}

/* ---------------------------------------------------------------- change */

/** Complete: the task leaves the matrix for the history tab. */
export function completeTask(id: string) {
  const task = findTask(id);
  if (!task) return;
  task.completedAt = now();
  commit(task);
}

/** Undo a completion — back to the quadrant it came from. */
export function restoreTask(id: string) {
  const task = findTask(id);
  if (!task) return;
  task.completedAt = null;
  commit(task);
}

/** Set or clear the due date ('YYYY-MM-DD' or null). */
export function setDue(id: string, value: string | null) {
  const task = findTask(id);
  if (!task) return;
  task.dueDate = value || null;
  commit(task);
}

/** Soft delete — the task moves to the trash tab and stays restorable. */
export function deleteTask(id: string) {
  const task = findTask(id);
  if (!task) return;
  task.deletedAt = now();
  commit(task);
}

/** Undo a soft delete. */
export function untrashTask(id: string) {
  const task = findTask(id);
  if (!task) return;
  task.deletedAt = null;
  commit(task);
}

/**
 * Permanent delete. The row stays in the array as a tombstone rather than being
 * dropped: another device that has not synced yet still holds it, and a row
 * that merely vanishes here is one that device would push straight back. Its
 * text and memo go, because the marker has to outlive them by months.
 *
 * dropExpiredTombstones() in shared/core.js is what finally removes it.
 */
export function tombstone(task: Task) {
  task.purgedAt = now();
  task.text = "";
  task.memo = null;
}

export function purgeTask(id: string) {
  const task = findTask(id);
  if (!task) return;
  tombstone(task);
  commit(task);
}

/**
 * Rename. Emptying the text deletes the task instead, which is how inline
 * editing doubles as "clear this row". Does not redraw: the editor that called
 * it renders once when it closes.
 */
export function editTask(id: string, text: string) {
  const task = findTask(id);
  if (!task) return;
  // Inline editing is contentEditable, so the add form's maxlength does not
  // apply — a pasted wall of text would be stored as-is.
  const trimmed = clampText(text);
  if (!trimmed) {
    deleteTask(id);
    return;
  }
  task.text = trimmed;
  persist(task);
}

/** Attach or replace a task's memo. */
export function setMemo(id: string, memo: string | null) {
  const task = findTask(id);
  if (!task) return;
  task.memo = memo;
  commit(task);
}

/**
 * Move `id` into `quadrant`, placed right before `beforeId` (or last).
 *
 * The drop also decides the task's matrix: dragging down out of the inbox files
 * it under the board on screen, dragging back up into the inbox hands it back to
 * both. That is what makes "다 꺼내기 → 분류" the moment a task becomes 업무 or
 * 일상, and it is why a task can be re-filed to the other board by parking it in
 * the inbox and pulling it down again on the other side.
 */
export function moveTask(
  id: string,
  quadrant: Place,
  beforeId: string | null = null,
) {
  const task = findTask(id);
  if (!task || id === beforeId) return;

  // Set the destination first: the neighbours are read from that quadrant, and
  // the moving row has to be excluded from its own placement.
  task.quadrant = quadrant;
  task.space = spaceFor(quadrant, getSpace());

  const siblings = activeOf(quadrant).filter((t) => t.id !== id);
  const at = beforeId ? siblings.findIndex((t) => t.id === beforeId) : -1;
  const after = at === -1 ? null : siblings[at];
  const before = at === -1 ? siblings[siblings.length - 1] : siblings[at - 1];
  task.orderKey = orderKeyBetween(before?.orderKey, after?.orderKey);

  commit(task);
}
