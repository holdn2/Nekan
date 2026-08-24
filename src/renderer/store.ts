/**
 * The tasks the renderer is showing, and every change to them.
 *
 * Knows nothing about the DOM. A change ends in commit(), which saves through
 * window.api and rings render-bus; who redraws, and how, is the views' problem.
 *
 * Four rules from the data model run through all of it:
 *   - a task is never removed from the array; the three states are timestamps
 *   - a purged row is a tombstone, kept so an unsynced device cannot revive it
 *   - order inside a quadrant is orderKey, never array position
 *   - quadrant === INBOX means space === null, which is what makes the dump
 *     shared between the two boards
 *
 * The pieces are in store/ beside this file. `export *` would also export
 * allTasks(), which is the one name that has to stay inside, so the list is
 * written out.
 */

export {
  setClockOffset,
  setTasks,
  acceptSynced,
  activeCount,
  findTask,
  getSpace,
  setSpace,
  inSpace,
} from "./store/state.js";
export {
  activeOf,
  inboxTasks,
  doneTasks,
  trashedTasks,
} from "./store/selectors.js";
export {
  addTask,
  addTasks,
  completeTask,
  restoreTask,
  setDue,
  deleteTask,
  untrashTask,
  purgeTask,
  editTask,
  setMemo,
  moveTask,
} from "./store/mutations.js";
export { trashAll, untrashAll, purgeAll } from "./store/bulk.js";
