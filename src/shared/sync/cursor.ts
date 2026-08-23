/**
 * What still has to go up, and how far a pull has read.
 *
 * The cursor is an optimisation, never the truth: server_seq is handed out
 * inside a transaction, so a row that committed first can carry a higher
 * number, and a pull landing in that gap would skip it forever. main/sync.ts
 * throws the cursor away and re-reads everything periodically for exactly that
 * reason -- see RECONCILE_MS there.
 */

import { stamp } from "./rows.js";
import type { LooseTask, Row } from "./rows.js";

/**
 * What still has to go up.
 *
 * Anything stamped at or after the last push. The boundary is inclusive on
 * purpose: an edit made in the same millisecond as the previous push would fall
 * through an exclusive one and never be sent again. The cost is that the newest
 * row or two get re-sent, which the server drops on its own -- an equal
 * updated_at loses there.
 */
export function pendingChanges(
  tasks: LooseTask[] | null | undefined,
  since: unknown,
): LooseTask[] {
  const from = stamp(since);
  return (tasks || []).filter((t) => stamp(t.updatedAt) >= from);
}

/**
 * What has genuinely not reached the server yet.
 *
 * Strictly newer than the watermark, where pendingChanges is deliberately not:
 * the inclusive boundary there is worth a few re-sends, but shown to a user it
 * would read "1개 대기" forever after every successful sync. Same idea, two
 * different jobs -- one decides what to send, this one decides what to say.
 */
export function unsentChanges(
  tasks: LooseTask[] | null | undefined,
  since: unknown,
): LooseTask[] {
  const from = stamp(since);
  return (tasks || []).filter((t) => stamp(t.updatedAt) > from);
}

/** How far `pendingChanges` may be advanced once those rows are accepted. */
export function pushedThrough(
  pending: LooseTask[] | null | undefined,
  since: unknown,
): number {
  return (pending || []).reduce(
    (max, t) => Math.max(max, stamp(t.updatedAt)),
    stamp(since),
  );
}

/**
 * The cursor to ask from next time.
 *
 * The largest server_seq in the batch, never smaller than the one we came in
 * with -- a page that arrives empty or out of order must not rewind the client
 * and make it replay everything.
 */
export function nextCursor(
  // Only server_seq is read, so a caller with half a row -- the tests, and a
  // reply that carried nothing else -- is answering the question fully.
  rows: ReadonlyArray<{ server_seq?: unknown }> | null | undefined,
  cursor: unknown,
): number {
  return (rows || []).reduce(
    (max, row) => Math.max(max, stamp(row.server_seq)),
    stamp(cursor),
  );
}

/** How many rows one pull may ask for. Also what "the page was full" means. */
export const PAGE_SIZE = 500;

/**
 * Is there more waiting behind this page?
 *
 * A full page means "ask again", and only a short one means the client has
 * caught up. Guessing from the row count alone is the whole trick, and getting
 * it wrong is quiet: a first sync that stops after one page loses the *oldest*
 * rows, which is exactly the part nobody scrolls to for months.
 *
 * A full last page costs one extra empty request. That is the right way round.
 */
export function hasMore(
  rows: unknown[] | null | undefined,
  limit: number = PAGE_SIZE,
): boolean {
  return (rows || []).length >= limit;
}
