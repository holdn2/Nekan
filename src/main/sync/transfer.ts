/**
 * The two directions, as plain requests.
 *
 * Neither decides anything. shared/sync says which version of a row wins, what
 * still has to go up and where the cursor moved to, and npm test covers that.
 * What is left here is the HTTP and the paging.
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
} from "../../shared/sync";
import { request } from "../api-client";
import { getStore, persist, setTasks } from "../store";

/** A pull that has not run out of pages by here is a bug, not a big account. */
const MAX_PAGES = 400;

/**
 * Read every row past `from`, applying each page as it arrives.
 *
 * Applying per page rather than at the end matters on a first sync: a hundred
 * pages that only land if all hundred arrive is a sync that never completes on
 * a bad connection.
 */
async function pull(token: string, from: number, watermark: number) {
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
      // Taken before the merge: an edit that had not left this machine yet and
      // then lost to the server version is exactly "내가 쓴 것이 날아갔다", and
      // it is the one sync failure a user can neither see nor undo. Network
      // trouble stays silent because there is nothing to do about it; this
      // does not.
      const unsent = new Set(
        unsentChanges(getStore().tasks, watermark).map((t) => String(t.id)),
      );
      const merged = mergeIncoming(getStore().tasks, rows);
      if (merged.applied.length) {
        setTasks(merged.tasks);
        persist();
        applied += merged.applied.length;
        overwritten += merged.applied.filter((id) => unsent.has(id)).length;
      }
    }

    const moved = nextCursor(rows, cursor);
    // A full page that did not move the cursor would loop forever. It should be
    // impossible -- server_seq is a sequence and the filter is `gt` -- which is
    // exactly why it is worth refusing rather than trusting.
    if (!hasMore(rows) || moved <= cursor)
      return { ok: true, cursor: moved, applied, overwritten };
    cursor = moved;
  }
  // Falling out of the loop means the page cap was hit. The cursor has moved,
  // so the next run picks up where this one stopped and nothing is lost -- but
  // reaching 400 pages at all says something is wrong, and silence would hide
  // it behind a sync that merely looks slow.
  console.error(
    `sync: pull stopped at the ${MAX_PAGES} page cap, resuming from ${cursor}`,
  );
  return { ok: true, cursor, applied, overwritten };
}

/* ------------------------------------------------------------------- push */

/**
 * Send everything stamped at or after the watermark, in batches.
 *
 * The upsert is `resolution=merge-duplicates`, and the trigger drops any row
 * whose updated_at is not newer than what is stored -- so re-sending is free
 * and the client does not have to know what the server already has.
 */
async function push(token: string, userId: string, from: number) {
  const pending = pendingChanges(getStore().tasks, from);
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

export { pull, push };
