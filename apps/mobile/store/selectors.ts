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
