/**
 * The loop that keeps this device and the server the same: pull what arrived,
 * push what has not left yet.
 *
 * All of the hard decisions were made elsewhere. shared/sync.js says which of
 * two versions of a task wins, what still needs sending and where the cursor
 * moved to, and it is covered by npm test. This file is the scheduling, the
 * HTTP and the retries around it -- and the two things a pure function cannot
 * hold: when to run, and what to do when the network says no.
 *
 * It never deletes a local task. Logging out leaves the file exactly as it is,
 * because the tasks were the user's before an account existed and the app has
 * to keep working when the server does not.
 */

const {
  PAGE_SIZE,
  hasMore,
  mergeIncoming,
  nextCursor,
  pendingChanges,
  pushedThrough,
  toRow,
} = require("../shared/sync");
const { getAccessToken, getPublicSession, request } = require("./api-client");
const { getSettings, getStore, persist, setTasks } = require("./store");

/** After a local change. Long enough to collect a burst of typing into one push. */
const SOON_MS = 3000;
/** The heartbeat, for changes that arrived on another device. */
const IDLE_MS = 60_000;
/** Backoff after a failure; the last one repeats for as long as it keeps failing. */
const RETRY_MS = [5000, 20_000, 60_000, 300_000];
/** How often the cursor is thrown away and everything read back. See reconcile. */
const RECONCILE_MS = 6 * 60 * 60 * 1000;
/** A pull that has not run out of pages by here is a bug, not a big account. */
const MAX_PAGES = 400;

/** Set by initSync: how the merged list reaches the window. */
let announce = () => {};
let timer = null;
let running = false;
let failures = 0;
let reconciledAt = 0;
/** A save that arrived mid-run, whose rows this run had already read past. */
let dirty = false;

/**
 * Cursor and push watermark, kept in settings so they survive a restart.
 *
 * They belong to one account. Signing in as somebody else has to start from
 * nothing, or the other account's cursor would make this one skip every row
 * written before it.
 */
function syncState() {
  const settings = getSettings();
  if (!settings.sync) settings.sync = { userId: null, cursor: 0, pushedAt: 0 };
  return settings.sync;
}

/* ------------------------------------------------------------------- pull */

/**
 * Read every row past `from`, applying each page as it arrives.
 *
 * Applying per page rather than at the end matters on a first sync: a hundred
 * pages that only land if all hundred arrive is a sync that never completes on
 * a bad connection.
 */
async function pull(token, from) {
  let cursor = from;
  let applied = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await request(
      `/rest/v1/tasks?select=*&server_seq=gt.${cursor}` +
        `&order=server_seq.asc&limit=${PAGE_SIZE}`,
      { token },
    );
    if (!res.ok) return { ok: false, cursor, applied };

    const rows = Array.isArray(res.body) ? res.body : [];
    if (rows.length) {
      const merged = mergeIncoming(getStore().tasks, rows);
      if (merged.applied.length) {
        setTasks(merged.tasks);
        persist();
        applied += merged.applied.length;
      }
    }

    const moved = nextCursor(rows, cursor);
    // A full page that did not move the cursor would loop forever. It should be
    // impossible -- server_seq is a sequence and the filter is `gt` -- which is
    // exactly why it is worth refusing rather than trusting.
    if (!hasMore(rows) || moved <= cursor)
      return { ok: true, cursor: moved, applied };
    cursor = moved;
  }
  return { ok: true, cursor, applied };
}

/* ------------------------------------------------------------------- push */

/**
 * Send everything stamped at or after the watermark, in batches.
 *
 * The upsert is `resolution=merge-duplicates`, and the trigger drops any row
 * whose updated_at is not newer than what is stored -- so re-sending is free
 * and the client does not have to know what the server already has.
 */
async function push(token, userId, from) {
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

/* ---------------------------------------------------------------- the loop */

/** Start again in `ms`, replacing whatever was already queued. */
function schedule(ms) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    runSync();
  }, ms);
}

function backOff() {
  failures += 1;
  schedule(RETRY_MS[Math.min(failures - 1, RETRY_MS.length - 1)]);
}

/**
 * Forget the cursor and read the whole account back, occasionally.
 *
 * The cursor is an optimisation, not a source of truth, and it has one hole:
 * server_seq is handed out inside a transaction, so a row can be given a lower
 * number than one that commits before it. A pull landing in that gap would step
 * past a row and never ask for it again. Reading everything back closes it, and
 * because the merge is last-write-wins it costs nothing but the request.
 */
function reconcileDue() {
  return Date.now() - reconciledAt >= RECONCILE_MS;
}

async function runSync() {
  if (running) return;

  const session = getPublicSession();
  if (!session || !session.userId) return;
  const token = await getAccessToken();
  // No token and a session means the renewal failed. That is the network's
  // problem, not the user's; try again on the usual schedule.
  if (!token) return backOff();

  running = true;
  dirty = false;
  try {
    useAccount(session.userId);
    const state = syncState();
    const reconcile = reconcileDue();

    const pulled = await pull(token, reconcile ? 0 : state.cursor);
    state.cursor = Math.max(state.cursor, pulled.cursor);
    if (!pulled.ok) {
      persist();
      return backOff();
    }
    if (reconcile) reconciledAt = Date.now();

    const pushed = await push(token, session.userId, state.pushedAt);
    state.pushedAt = pushed.pushedAt;
    persist();
    if (!pushed.ok) return backOff();

    failures = 0;
    // Only when rows actually landed: the window redraws from this, and a
    // heartbeat that redrew every minute would fight whatever is on screen.
    if (pulled.applied) announce(getStore().tasks);
    // A save during the run may have been stamped after push() read the list.
    // Waiting a whole heartbeat for it would look like the edit did not sync.
    schedule(dirty ? SOON_MS : IDLE_MS);
  } finally {
    running = false;
  }
}

/* ------------------------------------------------------------------ public */

/**
 * Point the cursor at an account, clearing it if that is a different one.
 *
 * Logging out passes null, which also clears it -- the next person to log in on
 * this machine must not inherit a cursor that says the account is up to date.
 */
function useAccount(userId) {
  const state = syncState();
  if (state.userId === userId) return;
  state.userId = userId || null;
  state.cursor = 0;
  state.pushedAt = 0;
  reconciledAt = 0;
  persist();
}

/**
 * Wire the loop up and let it start.
 *
 * `onTasks` is how merged rows reach the window; this module does not know what
 * a BrowserWindow is, for the same reason updater.js does not.
 */
function initSync(onTasks) {
  announce = typeof onTasks === "function" ? onTasks : () => {};
  // Not immediately: the window is still being built, and the first thing a
  // user sees should not be a list rearranging itself.
  schedule(SOON_MS);
}

/** Something changed locally. Coalesces, so calling it per keystroke is fine. */
function syncSoon() {
  if (running) {
    dirty = true;
    return;
  }
  schedule(SOON_MS);
}

/**
 * The account changed. Starts over from nothing, on purpose: after a login
 * every local task counts as pending and goes up.
 *
 * That is the behaviour the plan left open -- signing in on someone else's
 * machine would push their tasks into your account. Deciding what to ask, and
 * when, is the next piece; until then this does the obvious thing rather than a
 * half-measure that would be harder to undo.
 */
function syncAccount(userId) {
  useAccount(userId || null);
  failures = 0;
  if (userId) schedule(0);
  else clearTimeout(timer);
}

module.exports = { initSync, syncSoon, syncAccount };
