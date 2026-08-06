/**
 * The task list and every change that can happen to it.
 *
 * This module knows nothing about the DOM. Views call a mutation, the mutation
 * writes to disk and announces the change on the render bus — app.js is what
 * subscribes to it. Keeping the arrow pointing this way (views → store, never
 * store → views) is what lets the two halves be read on their own.
 *
 * Four rules from the data model show up all over this file:
 *   - a task is never removed from the array. `completedAt`, `deletedAt` and
 *     `purgedAt` decide which list it appears in, if any.
 *   - `quadrant === INBOX` means `space === null`, which is what makes the
 *     inbox shared between the two boards. `spaceFor()` owns that rule.
 *   - anything that filters "what is on screen" goes through `inSpace()`.
 *   - order inside a quadrant is `orderKey`, not the array position. Nothing
 *     here may reorder the array and expect the screen to follow.
 */

import { notify } from "./render-bus.js";
import {
  DEFAULT_SPACE,
  INBOX,
  clampText,
  compareOrder,
  orderKeyBetween,
  sanitizeSpace,
  spaceFor,
} from "./core-bridge.js";

/** The whole renderer state that survives a restart. */
let tasks = [];
/** Which matrix the header toggle is on. Not a task field — a filter. */
let activeSpace = DEFAULT_SPACE;
/** Server time minus this machine's, measured by main from a response header. */
let clockOffset = 0;

/**
 * Every timestamp this file writes, on the server's clock rather than this
 * machine's.
 *
 * `updatedAt` decides who wins when the same task was edited on two devices, so
 * a laptop ten minutes slow would lose all of those and a phone ten minutes
 * fast would win all of them — quietly, and every time. The offset is zero
 * until main has spoken to the server, which is also the right answer for an
 * app that never signs in.
 */
const now = () => Date.now() + clockOffset;

/** Main learned a new offset. Applies to the next write, never to old rows. */
export function setClockOffset(ms) {
  clockOffset = Number.isFinite(ms) ? ms : 0;
}

/**
 * Mark the rows a mutation changed.
 *
 * A mutation that forgets to stamp `updatedAt` silently loses that edit on
 * another device. Every write goes through persist(), which is why the stamping
 * lives here rather than in each of the twenty callers.
 */
function touch(rows) {
  const at = now();
  rows.flat().forEach((task) => {
    if (task) task.updatedAt = at;
  });
}

/** Persist without redrawing — for edits whose caller renders itself. */
function persist(...touched) {
  touch(touched);
  window.api.save(tasks);
}

/**
 * Persist and tell the app to redraw. Every mutation below ends here, which is
 * why no view has to remember to save: reaching the store *is* saving.
 */
function commit(...touched) {
  persist(...touched);
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

/**
 * Take the list a sync just merged.
 *
 * Deliberately not commit(): main has the same list already and wrote it, so
 * saving here would send it straight back — and the save would schedule another
 * sync, which would answer with another list. Redraw only.
 */
export function acceptSynced(list) {
  if (!Array.isArray(list)) return;
  tasks = list;
  notify();
}

/**
 * How many tasks this machine is holding, both boards and every tab.
 *
 * Not filtered by `inSpace`: the question it answers is "what would go up if I
 * signed in", and that is all of them regardless of which board is on screen.
 * Tombstones are not tasks any more, so they do not count.
 */
export const activeCount = () => tasks.filter((t) => !t.purgedAt).length;

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

/**
 * Live rows of one quadrant: not purged, not trashed, not completed, on this
 * board — in `orderKey` order, which is the only order the screen has.
 */
export const activeOf = (q) =>
  tasks
    .filter(
      (t) =>
        !t.purgedAt &&
        !t.deletedAt &&
        !t.completedAt &&
        t.quadrant === q &&
        inSpace(t),
    )
    .sort(compareOrder);

/** Written down but not classified yet — same filter, fifth place. */
export const inboxTasks = () => activeOf(INBOX);

/** History, newest first. */
export const doneTasks = () =>
  tasks
    .filter((t) => !t.purgedAt && !t.deletedAt && t.completedAt && inSpace(t))
    .sort((a, b) => b.completedAt - a.completedAt);

/** Trash, newest first. Completed-then-deleted rows belong here, not history. */
export const trashedTasks = () =>
  tasks
    .filter((t) => !t.purgedAt && t.deletedAt && inSpace(t))
    .sort((a, b) => b.deletedAt - a.deletedAt);

/* ------------------------------------------------------------------- add */

/** The key that lands a new row after everything already in `quadrant`. */
function tailKey(quadrant) {
  const rows = activeOf(quadrant);
  return orderKeyBetween(rows.length ? rows[rows.length - 1].orderKey : null);
}

/** A new task, filed into `quadrant` on the board that is on screen. */
function makeTask(quadrant, text, dueDate) {
  const at = now();
  return {
    id: uid(),
    text,
    quadrant,
    // Filed straight into a quadrant, it belongs to the matrix on screen; typed
    // into the inbox, it belongs to neither yet (spaceFor returns null).
    space: spaceFor(quadrant, activeSpace),
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
 *
 * The tasks are pushed one at a time because each one's key is read off the
 * row before it; building them all first would give the whole paste one key.
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
  task.completedAt = now();
  commit(task);
}

/** Undo a completion — back to the quadrant it came from. */
export function restoreTask(id) {
  const task = findTask(id);
  if (!task) return;
  task.completedAt = null;
  commit(task);
}

/** Set or clear the due date ('YYYY-MM-DD' or null). */
export function setDue(id, value) {
  const task = findTask(id);
  if (!task) return;
  task.dueDate = value || null;
  commit(task);
}

/** Soft delete — the task moves to the trash tab and stays restorable. */
export function deleteTask(id) {
  const task = findTask(id);
  if (!task) return;
  task.deletedAt = now();
  commit(task);
}

/** Undo a soft delete. */
export function untrashTask(id) {
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
function tombstone(task) {
  task.purgedAt = now();
  task.text = "";
  task.memo = null;
}

export function purgeTask(id) {
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
  persist(task);
}

/** Attach or replace a task's memo. */
export function setMemo(id, memo) {
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
export function moveTask(id, quadrant, beforeId) {
  const task = findTask(id);
  if (!task || id === beforeId) return;

  // Set the destination first: the neighbours are read from that quadrant, and
  // the moving row has to be excluded from its own placement.
  task.quadrant = quadrant;
  task.space = spaceFor(quadrant, activeSpace);

  const siblings = activeOf(quadrant).filter((t) => t.id !== id);
  const at = beforeId ? siblings.findIndex((t) => t.id === beforeId) : -1;
  const after = at === -1 ? null : siblings[at];
  const before = at === -1 ? siblings[siblings.length - 1] : siblings[at - 1];
  task.orderKey = orderKeyBetween(before?.orderKey, after?.orderKey);

  commit(task);
}

/* ------------------------------------------------------------ bulk (tabs) */

/**
 * Every one of these takes the rows the tab just listed, never a fresh filter:
 * the lists are already scoped to the board on screen, and re-deriving the set
 * from a condition would sweep up the *other* board's rows, which are not
 * visible and were never part of what the user confirmed.
 *
 * All three write to the task objects they were handed, and those are the very
 * objects in `tasks` — a mutation cannot reach a row outside `items`, so they
 * are id-precise as they stand. `purgeAll` used to be the exception because it
 * rebuilt the array and rebuilding needs an identity test; now that purging is
 * a tombstone it writes to the row like the others.
 */

/** "전체 휴지통으로" — soft-delete the whole history list. */
export function trashAll(items) {
  if (!items.length) return;
  const at = now();
  items.forEach((t) => {
    t.deletedAt = at;
  });
  commit(items);
}

/** "전체 복원" — pull the whole trash list back out. */
export function untrashAll(items) {
  if (!items.length) return;
  items.forEach((t) => {
    t.deletedAt = null;
  });
  commit(items);
}

/** "휴지통 비우기" — permanent for the user, a tombstone in the file. */
export function purgeAll(items) {
  if (!items.length) return;
  items.forEach(tombstone);
  commit(items);
}
