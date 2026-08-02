/**
 * The task list and every change that can happen to it.
 *
 * This module knows nothing about the DOM. Views call a mutation, the mutation
 * writes to disk and announces the change on the render bus — app.js is what
 * subscribes to it. Keeping the arrow pointing this way (views → store, never
 * store → views) is what lets the two halves be read on their own.
 *
 * Three rules from the data model show up all over this file:
 *   - a task is never removed from the array; `completedAt` and `deletedAt`
 *     decide which list it appears in. `purge` is the single exception.
 *   - `quadrant === INBOX` means `space === null`, which is what makes the
 *     inbox shared between the two boards. `spaceFor()` owns that rule.
 *   - anything that filters "what is on screen" goes through `inSpace()`.
 */

import { notify } from './render-bus.js';
import {
  DEFAULT_SPACE,
  INBOX,
  clampText,
  sanitizeSpace,
  spaceFor,
} from './core-bridge.js';

/** The whole renderer state that survives a restart. */
let tasks = [];
/** Which matrix the header toggle is on. Not a task field — a filter. */
let activeSpace = DEFAULT_SPACE;

/** Persist without redrawing — for edits whose caller renders itself. */
function persist() {
  window.api.save(tasks);
}

/**
 * Persist and tell the app to redraw. Every mutation below ends here, which is
 * why no view has to remember to save: reaching the store *is* saving.
 */
function commit() {
  persist();
  notify();
}

/** Random enough for a local file; no coordination needed. */
const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ------------------------------------------------------------------- load */

/** Seed the store from the snapshot main.js sent at startup. */
export function setTasks(list) {
  tasks = list;
}

/** The task with this id, in whatever state — or undefined. */
export const findTask = (id) => tasks.find((t) => t.id === id);

/* ------------------------------------------------------------------ space */

export const getSpace = () => activeSpace;

/**
 * Switch boards. Only a filter changes — no task moves and nothing is written,
 * so the caller persists the *choice* through settings, not through the tasks.
 */
export function setSpace(next) {
  activeSpace = sanitizeSpace(next);
  return activeSpace;
}

/**
 * Is this task on the matrix currently on screen? A `space` of null means the
 * shared inbox, so those rows pass on both boards — every other list belongs to
 * one board alone.
 */
export const inSpace = (t) => t.space === null || t.space === activeSpace;

/* -------------------------------------------------------------- selectors */

/** Live rows of one quadrant: not completed, not trashed, on this board. */
export const activeOf = (q) =>
  tasks.filter(
    (t) => !t.deletedAt && !t.completedAt && t.quadrant === q && inSpace(t),
  );

/** Written down but not classified yet — same filter, fifth place. */
export const inboxTasks = () => activeOf(INBOX);

/** History, newest first. */
export const doneTasks = () =>
  tasks
    .filter((t) => !t.deletedAt && t.completedAt && inSpace(t))
    .sort((a, b) => b.completedAt - a.completedAt);

/** Trash, newest first. Completed-then-deleted rows belong here, not history. */
export const trashedTasks = () =>
  tasks
    .filter((t) => t.deletedAt && inSpace(t))
    .sort((a, b) => b.deletedAt - a.deletedAt);

/* ------------------------------------------------------------------- add */

/** A new task, filed into `quadrant` on the board that is on screen. */
function makeTask(quadrant, text, dueDate) {
  return {
    id: uid(),
    text,
    quadrant,
    // Filed straight into a quadrant, it belongs to the matrix on screen; typed
    // into the inbox, it belongs to neither yet (spaceFor returns null).
    space: spaceFor(quadrant, activeSpace),
    dueDate: dueDate || null,
    memo: null,
    createdAt: Date.now(),
    completedAt: null,
    deletedAt: null,
  };
}

/** Add one task; blank text (after trimming) is simply ignored. */
export function addTask(quadrant, text, dueDate) {
  const trimmed = clampText(text);
  if (!trimmed) return;
  tasks.push(makeTask(quadrant, trimmed, dueDate));
  commit();
}

/**
 * Bulk add for a pasted brain dump. One save and one render for the whole
 * batch — going through addTask per line would rebuild the DOM for every line
 * of the paste.
 */
export function addTasks(quadrant, texts) {
  if (!texts.length) return;
  texts.forEach((text) => tasks.push(makeTask(quadrant, text, null)));
  commit();
}

/* ---------------------------------------------------------------- change */

/** Complete: the task leaves the matrix for the history tab. */
export function completeTask(id) {
  const task = findTask(id);
  if (!task) return;
  task.completedAt = Date.now();
  commit();
}

/** Undo a completion — back to the quadrant it came from. */
export function restoreTask(id) {
  const task = findTask(id);
  if (!task) return;
  task.completedAt = null;
  commit();
}

/** Set or clear the due date ('YYYY-MM-DD' or null). */
export function setDue(id, value) {
  const task = findTask(id);
  if (!task) return;
  task.dueDate = value || null;
  commit();
}

/** Soft delete — the task moves to the trash tab and stays restorable. */
export function deleteTask(id) {
  const task = findTask(id);
  if (!task) return;
  task.deletedAt = Date.now();
  commit();
}

/** Undo a soft delete. */
export function untrashTask(id) {
  const task = findTask(id);
  if (!task) return;
  task.deletedAt = null;
  commit();
}

/** Permanent removal — the one place a task leaves the array. */
export function purgeTask(id) {
  tasks = tasks.filter((t) => t.id !== id);
  commit();
}

/**
 * Rename. Emptying the text deletes the task instead, which is how inline
 * editing doubles as "clear this row". Does not redraw: the editor that called
 * it renders once when it closes.
 */
export function editTask(id, text) {
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
  persist();
}

/** Attach or replace a task's memo. */
export function setMemo(id, memo) {
  const task = findTask(id);
  if (!task) return;
  task.memo = memo;
  commit();
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
export function moveTask(id, quadrant, beforeId) {
  const from = tasks.findIndex((t) => t.id === id);
  if (from === -1 || id === beforeId) return;
  const [task] = tasks.splice(from, 1);
  task.quadrant = quadrant;
  task.space = spaceFor(quadrant, activeSpace);
  const to = beforeId ? tasks.findIndex((t) => t.id === beforeId) : -1;
  if (to === -1) tasks.push(task);
  else tasks.splice(to, 0, task);
  commit();
}

/* ------------------------------------------------------------ bulk (tabs) */

/**
 * Every one of these takes the rows the tab just listed, never a fresh filter:
 * the lists are already scoped to the board on screen, and re-deriving the set
 * from a condition would sweep up the *other* board's rows, which are not
 * visible and were never part of what the user confirmed.
 */

/** "전체 휴지통으로" — soft-delete the whole history list. */
export function trashAll(items) {
  if (!items.length) return;
  const now = Date.now();
  items.forEach((t) => {
    t.deletedAt = now;
  });
  commit();
}

/** "전체 복원" — pull the whole trash list back out. */
export function untrashAll(items) {
  if (!items.length) return;
  items.forEach((t) => {
    t.deletedAt = null;
  });
  commit();
}

/**
 * "휴지통 비우기" — permanent, so the ids are collected first and the array is
 * filtered by membership. Filtering by `deletedAt` instead would delete the
 * other board's trash along with it.
 */
export function purgeAll(items) {
  if (!items.length) return;
  const doomed = new Set(items.map((t) => t.id));
  tasks = tasks.filter((t) => !doomed.has(t.id));
  commit();
}
