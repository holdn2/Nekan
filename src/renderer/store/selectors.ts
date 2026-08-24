/**
 * The lists the screens ask for.
 *
 * Every one of them goes through inSpace(), because the boards are a filter on
 * one array rather than two arrays -- a list that forgot would show the other
 * matrix's rows, or let a bulk action reach them.
 *
 * Order comes from compareOrder(), never from the array. Position in the array
 * means nothing; orderKey does.
 */

import type { Place, Task } from "../../shared/types.js";
import { INBOX, compareOrder } from "../../shared/core.js";
import { allTasks, inSpace } from "./state.js";

/**
 * Live rows of one quadrant: not purged, not trashed, not completed, on this
 * board — in `orderKey` order, which is the only order the screen has.
 */
export const activeOf = (q: Place) =>
  allTasks()
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

/**
 * A row whose state is written in one of the timestamps, narrowed so the sort
 * that follows can read it.
 *
 * The filter already guarantees it, but only to a reader -- the compiler sees
 * `number | null` and is right to. Saying it as a predicate is the difference
 * between telling the compiler to look away and telling it what is true.
 */
type Stamped<K extends "completedAt" | "deletedAt"> = Task & {
  [P in K]: number;
};

const isCompleted = (t: Task): t is Stamped<"completedAt"> =>
  !t.purgedAt && !t.deletedAt && t.completedAt !== null;

const isTrashed = (t: Task): t is Stamped<"deletedAt"> =>
  !t.purgedAt && t.deletedAt !== null;

/** History, newest first. */
export const doneTasks = () =>
  allTasks()
    .filter(isCompleted)
    .filter(inSpace)
    .sort((a, b) => b.completedAt - a.completedAt);

/** Trash, newest first. Completed-then-deleted rows belong here, not history. */
export const trashedTasks = () =>
  allTasks()
    .filter(isTrashed)
    .filter(inSpace)
    .sort((a, b) => b.deletedAt - a.deletedAt);
