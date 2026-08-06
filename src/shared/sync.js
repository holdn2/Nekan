/**
 * The decisions sync has to make, as functions of their inputs alone.
 *
 * Nothing here talks to a network or a file. What is left is the part that is
 * actually hard to get right and impossible to eyeball: which of two versions
 * of a task wins, what still needs sending, and where the cursor moved to. The
 * HTTP, the tokens and the retries live in main/ and are boring by comparison.
 *
 * Required of main/ and the tests only -- never loaded by the renderer, which
 * is why this file may be plain CommonJS unlike core.js.
 */

const { normalizeTasks } = require("./core");

/** Column names, in the order the row object is built. JS is camel, SQL snake. */
const FIELDS = [
  ["text", "text"],
  ["quadrant", "quadrant"],
  ["space", "space"],
  ["dueDate", "due_date"],
  ["memo", "memo"],
  ["orderKey", "order_key"],
  ["createdAt", "created_at"],
  ["updatedAt", "updated_at"],
  ["completedAt", "completed_at"],
  ["deletedAt", "deleted_at"],
  ["purgedAt", "purged_at"],
];

/** A missing or unparseable stamp sorts before every real one. */
function stamp(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Task -> the row shape the server stores. `userId` is the caller's own. */
function toRow(task, userId) {
  const row = { user_id: userId, id: String(task.id) };
  for (const [key, column] of FIELDS) {
    row[column] = task[key] === undefined ? null : task[key];
  }
  // updated_at is the one column the table refuses to take a null for, and its
  // DEFAULT cannot save us: Postgres only applies a default when the column is
  // *absent*, and every column is present here. A task that never went through
  // normalizeTasks would send null, and the whole batch it travelled in would
  // come back 23502 -- one malformed row is enough to wedge every sync after
  // it, since the push retries the same batch forever.
  row.updated_at = stamp(task.updatedAt);
  // server_seq is deliberately absent: the server stamps it and ignores what a
  // client claims. Sending one would only look like it worked.
  return row;
}

/** The row shape the server stores -> a task the rest of the app understands. */
function fromRow(row) {
  const task = { id: String(row.id) };
  for (const [key, column] of FIELDS) {
    task[key] = row[column] === undefined ? null : row[column];
  }
  return task;
}

/**
 * Does the copy that came back from the server replace the one held locally?
 *
 * Yes unless the local one is *strictly* newer. The tie matters: the server
 * keeps what it already had when an equal stamp arrives, so if the client also
 * kept its own on a tie, two devices that edited in the same millisecond would
 * hold different rows forever and neither would ever hear otherwise. One side
 * has to yield, and the server is the only side both devices can see.
 */
function remoteWins(local, remote) {
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
function mergeIncoming(tasks, rows) {
  const byId = new Map((tasks || []).map((t) => [String(t.id), t]));
  const applied = [];
  const kept = [];

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

/**
 * What still has to go up.
 *
 * Anything stamped at or after the last push. The boundary is inclusive on
 * purpose: an edit made in the same millisecond as the previous push would fall
 * through an exclusive one and never be sent again. The cost is that the newest
 * row or two get re-sent, which the server drops on its own -- an equal
 * updated_at loses there.
 */
function pendingChanges(tasks, since) {
  const from = stamp(since);
  return (tasks || []).filter((t) => stamp(t.updatedAt) >= from);
}

/** How far `pendingChanges` may be advanced once those rows are accepted. */
function pushedThrough(pending, since) {
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
function nextCursor(rows, cursor) {
  return (rows || []).reduce(
    (max, row) => Math.max(max, stamp(row.server_seq)),
    stamp(cursor),
  );
}

/** How many rows one pull may ask for. Also what "the page was full" means. */
const PAGE_SIZE = 500;

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
function hasMore(rows, limit = PAGE_SIZE) {
  return (rows || []).length >= limit;
}

/* ------------------------------------------------------------------ clock */

/**
 * How far a fresh sample has to be from the offset in hand before it is worth
 * believing.
 *
 * Two things make small samples meaningless. The Date header has one-second
 * resolution, and it was written when the server began the reply rather than
 * when we finished reading it, so every sample is a little low by however long
 * the response spent on the wire. Neither matters: this correction exists to
 * catch a clock that is minutes or hours out, not milliseconds.
 */
const CLOCK_TOLERANCE_MS = 2000;

/**
 * Server time minus ours, read off a response's Date header.
 *
 * Zero for a missing or unparseable header, which is also the right answer for
 * "we have no idea" -- an unknown offset must leave the clock alone rather than
 * shift it somewhere arbitrary.
 */
function clockOffset(dateHeader, receivedAt) {
  if (!dateHeader) return 0;
  const server = Date.parse(dateHeader);
  if (!Number.isFinite(server)) return 0;
  return server - receivedAt;
}

/**
 * The offset to keep, given the one in hand and a fresh sample.
 *
 * Sampling noise must not move it. `updatedAt` decides who wins on two devices,
 * so an offset that jitters by a few hundred milliseconds every request would
 * make the order of two edits depend on which reply happened to arrive first.
 */
function nextOffset(current, sample, tolerance = CLOCK_TOLERANCE_MS) {
  const now = Number.isFinite(current) ? current : 0;
  if (!Number.isFinite(sample)) return now;
  return Math.abs(sample - now) >= tolerance ? sample : now;
}

module.exports = {
  CLOCK_TOLERANCE_MS,
  FIELDS,
  PAGE_SIZE,
  stamp,
  toRow,
  fromRow,
  remoteWins,
  mergeIncoming,
  pendingChanges,
  pushedThrough,
  nextCursor,
  hasMore,
  clockOffset,
  nextOffset,
};
