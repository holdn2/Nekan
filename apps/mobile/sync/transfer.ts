/**
 * The two directions, as plain requests.
 *
 * Neither decides anything. `shared/sync` says which version of a row wins,
 * what still has to go up and where the cursor moved to, and `npm test` covers
 * that on both platforms. What is left here is the HTTP and the paging, and it
 * is the desktop's `main/sync/transfer.ts` with this app's store in place of
 * that one's.
 */
import {
  PAGE_SIZE,
  hasMore,
  mergeIncoming,
  nextCursor,
  pendingChanges,
  pushedThrough,
  toRow,
  unsentChanges,
} from "@nekan/shared/sync";
import type { Task } from "@nekan/shared/types";
import { request } from "../api/http";
import { allTasks, setTasks } from "../store/state";

/** A pull that has not run out of pages by here is a bug, not a big account. */
const MAX_PAGES = 400;

export interface Pulled {
  ok: boolean;
  cursor: number;
  applied: number;
  overwritten: number;
}

/**
 * Read every row past `from`, applying each page as it arrives.
 *
 * Applying per page rather than at the end matters on a first sync: a hundred
 * pages that only land if all hundred arrive is a sync that never completes on
 * a bad connection -- and a phone's connection is the one that drops.
 */
export async function pull(
  token: string,
  from: number,
  watermark: number,
): Promise<Pulled> {
  let cursor = from;
  let applied = 0;
  let overwritten = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await request(
      `/rest/v1/tasks?select=*&server_seq=gt.${cursor}` +
        `&order=server_seq.asc&limit=${PAGE_SIZE}`,
      { token },
    );
    if (!res.ok) return { ok: false, cursor, applied, overwritten };

    const rows = Array.isArray(res.body) ? res.body : [];
    if (rows.length) {
      // Taken before the store is replaced -- `setTasks` is the line this has
      // to come first of, not the merge, which returns a new array and leaves
      // the store alone. An edit that had not left this device yet and then
      // lost to the server's version is exactly "what I wrote is gone", and it
      // is the one sync failure a person can neither see nor undo. Network
      // trouble stays silent because there is nothing to do about it. This
      // does not.
      const unsent = new Set(
        unsentChanges(allTasks() as Task[], watermark).map((t) => String(t.id)),
      );
      const merged = mergeIncoming(allTasks() as Task[], rows);
      if (merged.applied.length) {
        setTasks(merged.tasks);
        applied += merged.applied.length;
        overwritten += merged.applied.filter((id: string) =>
          unsent.has(id),
        ).length;
      }
    }

    const moved = nextCursor(rows, cursor);
    // A full page that did not move the cursor would loop forever. It should
    // be impossible -- server_seq is a sequence and the filter is `gt` -- which
    // is exactly why it is worth refusing rather than trusting.
    if (!hasMore(rows) || moved <= cursor)
      return { ok: true, cursor: moved, applied, overwritten };
    cursor = moved;
  }
  // The page cap. The cursor has moved, so the next run picks up where this
  // one stopped and nothing is lost -- but reaching 400 pages at all says
  // something is wrong, and silence would hide it behind a slow-looking sync.
  console.error(
    `sync: pull stopped at the ${MAX_PAGES} page cap, resuming from ${cursor}`,
  );
  return { ok: true, cursor, applied, overwritten };
}

export interface Pushed {
  ok: boolean;
  pushedAt: number;
  sent: number;
}

/**
 * Send everything stamped at or after the watermark, in batches.
 *
 * The upsert is `resolution=merge-duplicates`, and the trigger drops any row
 * whose `updated_at` is not newer than what is stored -- so re-sending is free
 * and this side does not have to know what the server already has.
 */
export async function push(
  token: string,
  userId: string,
  from: number,
): Promise<Pushed> {
  const pending = pendingChanges(allTasks() as Task[], from);
  if (!pending.length) return { ok: true, pushedAt: from, sent: 0 };

  for (let at = 0; at < pending.length; at += PAGE_SIZE) {
    const batch = pending.slice(at, at + PAGE_SIZE);
    const res = await request("/rest/v1/tasks", {
      method: "POST",
      token,
      prefer: "resolution=merge-duplicates,return=minimal",
      body: batch.map((task) => toRow(task, userId)),
    });
    // Stop at the first failure and keep the old watermark: a half-sent list
    // that moved the watermark would leave the rest behind permanently.
    if (!res.ok) return { ok: false, pushedAt: from, sent: at };
  }

  return {
    ok: true,
    pushedAt: pushedThrough(pending, from),
    sent: pending.length,
  };
}
