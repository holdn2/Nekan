/**
 * Reading a stored task list back as tasks.
 *
 * Everything a saved file may be missing or may have wrong is settled here:
 * this is the one place that decides what an old data.json becomes. Deletion
 * is a timestamp, never a splice, so the only rows that ever leave the array
 * are tombstones old enough to have reached every device.
 */

import type { Task } from "../types.js";
import { FALLBACK_QUAD, PLACES, spaceFor } from "./places.js";
import { clampMemo } from "./text.js";
import { assignOrderKeys, hasOrderKey } from "./order.js";
import { DAY_MS } from "./dates.js";

/**
 * How long a permanently deleted row stays in the file as a tombstone.
 *
 * Deleting for real used to mean dropping the row from the array, which works
 * exactly as long as the array is the only copy. Once another device has it,
 * a row that simply disappears here is a row that device still has — and it
 * pushes it back. The tombstone is what tells the other side "this is gone".
 * It can only be dropped for good once every device has certainly seen it.
 */
export const TOMBSTONE_TTL_MS = 90 * DAY_MS;

/**
 * Drop tombstones old enough that no device can still be carrying the row.
 * The only place a task really leaves the array — everything else is a flag.
 */
export function dropExpiredTombstones<T extends Partial<Task>>(
  list: T[] | null | undefined,
  now: number = Date.now(),
): T[] {
  if (!Array.isArray(list)) return [];
  return list.filter(
    (t) =>
      !(
        Number.isFinite(t?.purgedAt) &&
        now - (t.purgedAt as number) > TOMBSTONE_TTL_MS
      ),
  );
}

/**
 * Fill in fields older saves predate, and repair the ones whose bad values are
 * invisible: the matrix only walks QUADS and the inbox only reads INBOX, so an
 * unrecognised `quadrant` would keep the task in the file while it disappears
 * from every list; a `space` the toggle does not know would do the same on both
 * boards; a missing `orderKey` would collapse a quadrant's order; and a
 * non-string `memo` would render as "[object Object]".
 *
 * Never drops entries — that is dropExpiredTombstones()'s job alone.
 */
export function normalizeTasks(list: unknown): Task[] {
  if (!Array.isArray(list)) return [];
  const normalized = list.map((t) => {
    const quadrant = PLACES.includes(t?.quadrant) ? t.quadrant : FALLBACK_QUAD;
    const createdAt = Number.isFinite(t?.createdAt) ? t.createdAt : 0;
    const purged = Number.isFinite(t?.purgedAt);
    return {
      dueDate: null,
      deletedAt: null,
      completedAt: null,
      ...t,
      quadrant,
      space: spaceFor(quadrant, t?.space),
      memo: purged || typeof t?.memo !== "string" ? null : clampMemo(t.memo),
      // A row that predates the field has never been edited since it was
      // written, so its creation time is the honest last-changed time.
      updatedAt: Number.isFinite(t?.updatedAt) ? t.updatedAt : createdAt,
      // A row written before state had a stamp of its own carried one stamp
      // for the whole row. Reading it as that stamp is what makes such a row
      // go on meaning what it meant: content and state move together.
      stateAt: Number.isFinite(t?.stateAt)
        ? t.stateAt
        : Number.isFinite(t?.updatedAt)
          ? t.updatedAt
          : createdAt,
      purgedAt: purged ? (t.purgedAt as number) : null,
      // A tombstone carries no content. purgeTask empties both when it
      // buries, so a buried row that still has words got them from somewhere
      // else: a merge that kept the newer half, or a build from before the
      // rule. Every screen filters these out, so the words would sit in the
      // file and go up to the server unseen for the ninety days the tombstone
      // lives -- which is exactly what the purge was asked to prevent.
      text: purged ? "" : typeof t?.text === "string" ? t.text : "",
      orderKey: hasOrderKey(t) ? t.orderKey : null,
    };
  });
  return assignOrderKeys(normalized);
}
