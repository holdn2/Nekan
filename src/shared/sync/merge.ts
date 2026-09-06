/**
 * Which of two versions of a task wins, and what a pull leaves behind.
 *
 * Last write wins, and the server breaks the tie. A merge that decided ties
 * the other way would leave two devices that edited in the same millisecond
 * holding different rows forever, each certain it was right.
 *
 * What "last write" measures is two things, not one. A task carries a content
 * stamp and a state stamp, and they are compared separately -- because the
 * alternative was watching a completed task come back to life. Complete it on
 * the phone, write a memo on the laptop before the phone's row arrives, and a
 * whole-row merge hands the laptop's row the win: the memo it wrote, and the
 * empty completion it never touched. Nobody is told, because from the merge's
 * side nothing went wrong.
 *
 * Splitting the comparison is not the same as merging field by field, which
 * would need a stamp per column and a place to keep them. This buys the case
 * that actually happens -- one device changed what a task *is*, the other
 * changed where it stands -- and leaves the rest as it was: two devices
 * editing the same memo still settle on one of them.
 */

import { normalizeTasks } from "../core.js";
import type { Task } from "../types.js";
import { fromRow, stamp, stateStamp } from "./rows.js";
import type { LooseTask, Row } from "./rows.js";

/** The half a completion, a deletion or a purge moves, minus its own stamp. */
const STATE_FIELDS = ["completedAt", "deletedAt", "purgedAt"] as const;

/**
 * Does the copy that came back from the server replace the one held locally?
 *
 * Yes unless the local one is *strictly* newer. The tie matters: the server
 * keeps what it already had when an equal stamp arrives, so if the client also
 * kept its own on a tie, two devices that edited in the same millisecond would
 * hold different rows forever and neither would ever hear otherwise. One side
 * has to yield, and the server is the only side both devices can see.
 */
export function remoteWins(local: LooseTask, remote: LooseTask): boolean {
  return !(stamp(local.updatedAt) > stamp(remote.updatedAt));
}

/**
 * The same question for the other half: completed, trashed, purged.
 *
 * Ties go the same way and for the same reason. A row that predates the state
 * stamp answers with its content stamp, so two old rows compare exactly as
 * they always did.
 */
export function remoteStateWins(local: LooseTask, remote: LooseTask): boolean {
  return !(stateStamp(local) > stateStamp(remote));
}

/**
 * One task from two, taking each half from whichever side changed it later.
 *
 * The state fields travel together. Completing a task and trashing it are the
 * same field's business -- a row is in one place at a time -- so they share a
 * stamp and move as a unit.
 */
function mergeOne(local: LooseTask, remote: LooseTask): LooseTask {
  const content = remoteWins(local, remote);
  const state = remoteStateWins(local, remote);
  if (content && state) return remote;
  const merged: LooseTask = { ...(content ? remote : local) };
  const from = state ? remote : local;
  for (const field of STATE_FIELDS) {
    (merged as Record<string, unknown>)[field] = from[field] ?? null;
  }
  // Read rather than copied. The winner may be a row from before the split,
  // whose state stamp is its content stamp -- copying the absent field would
  // leave the merged row with none, and normalizeTasks would then fill it from
  // the *content* winner's stamp, which is somebody else's clock entirely. A
  // genuine state change in between would arrive looking older than a stamp
  // nothing ever wrote.
  merged.stateAt = stateStamp(from);
  return merged;
}

/**
 * Fold rows pulled from the server into the local list.
 *
 * Returns a new array -- callers hand it to setTasks() rather than mutating --
 * plus the ids that changed and the ids where the local copy stood its ground.
 * Local order is preserved and rows never seen before are appended; the display
 * order comes from orderKey, so array position carries no meaning here.
 *
 * The result is normalized before it goes back, and that is not belt and
 * braces. These rows were written by *another* device, possibly an older build,
 * and nothing on the way in has checked them: a row claiming quadrant 'inbox'
 * with a non-null space would break the one rule the whole board rests on. The
 * check belongs here rather than in a caller, because a caller that forgets is
 * exactly how such a row would arrive.
 */
export function mergeIncoming(
  tasks: LooseTask[] | null | undefined,
  rows: Row[] | null | undefined,
): { tasks: Task[]; applied: string[]; kept: string[] } {
  const byId = new Map<string, LooseTask>(
    (tasks || []).map((t) => [String(t.id), t]),
  );
  const applied: string[] = [];
  const kept: string[] = [];

  for (const row of rows || []) {
    const remote = fromRow(row);
    const local = byId.get(remote.id);
    if (!local) {
      byId.set(remote.id, remote);
      applied.push(remote.id);
      continue;
    }
    // Nothing the server holds is newer in either half. The local row stands
    // as it is -- and stays the one that goes up on the next push, which is
    // how the server hears about the half it is behind on.
    if (!remoteWins(local, remote) && !remoteStateWins(local, remote)) {
      kept.push(remote.id);
      continue;
    }
    byId.set(remote.id, mergeOne(local, remote));
    applied.push(remote.id);
  }

  return { tasks: normalizeTasks([...byId.values()]), applied, kept };
}
