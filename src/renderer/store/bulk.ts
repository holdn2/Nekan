/**
 * The buttons at the top of the history and trash tabs.
 *
 * Each takes the rows the tab is already showing rather than filtering the
 * array again. The tab has applied the active board; filtering here a second
 * time would reach the other one, and the user would lose a list they cannot
 * even see.
 */

import type { Task } from "../../shared/types.js";
import { commit, now } from "./state.js";
import { tombstone } from "./mutations.js";

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
export function trashAll(items: Task[]) {
  if (!items.length) return;
  const at = now();
  items.forEach((t) => {
    t.deletedAt = at;
  });
  commit(items);
}

/** "전체 복원" — pull the whole trash list back out. */
export function untrashAll(items: Task[]) {
  if (!items.length) return;
  items.forEach((t) => {
    t.deletedAt = null;
  });
  commit(items);
}

/** "휴지통 비우기" — permanent for the user, a tombstone in the file. */
export function purgeAll(items: Task[]) {
  if (!items.length) return;
  items.forEach(tombstone);
  commit(items);
}
