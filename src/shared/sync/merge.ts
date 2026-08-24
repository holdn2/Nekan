/**
 * Which of two versions of a task wins, and what a pull leaves behind.
 *
 * Last write wins on `updatedAt`, and the server breaks the tie. A merge that
 * decided ties the other way would leave two devices that edited in the same
 * millisecond holding different rows forever, each certain it was right.
 */

import { normalizeTasks } from "../core.js";
import type { Task } from "../types.js";
import { fromRow, stamp } from "./rows.js";
import type { LooseTask, Row } from "./rows.js";

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
    if (local && !remoteWins(local, remote)) {
      kept.push(remote.id);
      continue;
    }
    byId.set(remote.id, remote);
    applied.push(remote.id);
  }

  return { tasks: normalizeTasks([...byId.values()]), applied, kept };
}
