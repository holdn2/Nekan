/**
 * The lists the screens ask for.
 *
 * Every one goes through `inSpace()`, because the two boards are a filter on
 * one array rather than two arrays -- a list that forgot would show the other
 * board's rows. And order comes from `compareOrder()`, never from the array:
 * position in the array means nothing, `orderKey` does.
 *
 * Same rules as the renderer's selectors, and deliberately the same shape --
 * the difference between the two files should stay boring.
 */
import { INBOX, QUADS, compareOrder } from "@nekan/shared/core";
import type { Place, Quadrant, Task } from "@nekan/shared/types";
import { allTasks, inSpace } from "./state";

/** Not purged, not trashed, not completed, on this board -- in orderKey order. */
export const activeOf = (q: Place): Task[] =>
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

/** Written down but not classified yet -- the same filter, fifth place. */
export const inboxTasks = (): Task[] => activeOf(INBOX);

/** What the four cards show. Built in one pass so the four cannot disagree. */
export function counts(): Record<Quadrant, number> {
  const out = { q1: 0, q2: 0, q3: 0, q4: 0 };
  for (const t of allTasks()) {
    if (t.purgedAt || t.deletedAt || t.completedAt) continue;
    if (!inSpace(t)) continue;
    if (t.quadrant !== INBOX) out[t.quadrant as Quadrant] += 1;
  }
  return out;
}

/** The four, in the order the grid draws them. */
export const quadrants = (): readonly Quadrant[] => QUADS;

/**
 * The two finished lists.
 *
 * Said as predicates rather than filters so the sort below can read the
 * timestamp without a cast: `completedAt` is `number | null` on Task and is
 * right to be. Both go through `inSpace` like every other list -- a board is
 * a filter, and history is not exempt from it.
 *
 * A row that was completed and then deleted belongs to the trash, not to
 * history. That is what the order of the checks says.
 */
type Stamped<K extends "completedAt" | "deletedAt"> = Task & {
  [P in K]: number;
};

const isCompleted = (t: Task): t is Stamped<"completedAt"> =>
  !t.purgedAt && !t.deletedAt && t.completedAt !== null;

const isTrashed = (t: Task): t is Stamped<"deletedAt"> =>
  !t.purgedAt && t.deletedAt !== null;

/** History, newest first. */
export const doneTasks = (): Task[] =>
  allTasks()
    .filter(isCompleted)
    .filter(inSpace)
    .sort((a, b) => b.completedAt - a.completedAt);

/** Trash, newest first. */
export const trashedTasks = (): Task[] =>
  allTasks()
    .filter(isTrashed)
    .filter(inSpace)
    .sort((a, b) => b.deletedAt - a.deletedAt);

/**
 * Search reads the whole list, never the rows on screen.
 *
 * A task finished in March has to be findable, and it is nowhere near the
 * part of the list a finger has scrolled to. Matching is case-insensitive on
 * text and memo, which is where the words a person would search for are.
 */
export function search(list: Task[], query: string): Task[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (t) =>
      t.text.toLowerCase().includes(q) ||
      (t.memo ?? "").toLowerCase().includes(q),
  );
}
