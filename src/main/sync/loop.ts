/**
 * When to run, and what to do when the network says no.
 *
 * The cursor is thrown away and everything re-read at startup and every
 * RECONCILE_MS. server_seq is handed out inside a transaction, so a row that
 * commits first can carry a higher number, and a pull landing in that gap
 * would skip it forever. Merging is last-write-wins, so reading it all again
 * costs a few requests and changes nothing else -- removing it loses a task
 * now and then, in a way nobody can reproduce.
 */

import { app } from "electron";
import { getAccessToken, getPublicSession } from "../api-client";
import { getStore, persist } from "../store";
import { pull, push } from "./transfer";
import type { Handlers } from "./status";
import {
  countUnsent,
  emitTasks,
  getSyncStatus,
  report,
  setHandlers,
  syncState,
} from "./status";

/** After a local change. Long enough to collect a burst of typing into one push. */
const SOON_MS = 3000;
/** The heartbeat, for changes that arrived on another device. */
const IDLE_MS = 60_000;
/** Backoff after a failure; the last one repeats for as long as it keeps failing. */
const RETRY_MS = [5000, 20_000, 60_000, 300_000];
/** How often the cursor is thrown away and everything read back. See reconcile. */
const RECONCILE_MS = 6 * 60 * 60 * 1000;
/**
 * The least time between one run and the next a return can ask for.
 *
 * Restoring a minimised window fires focus twice within milliseconds, and
 * alt-tabbing through a few windows fires it once each. Without this, a person
 * moving between windows would sync on every hop.
 */
const WAKE_GAP_MS = SOON_MS;

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let failures = 0;
let reconciledAt = 0;
/** A save that arrived mid-run, whose rows this run had already read past. */
let dirty = false;
/** When the last run finished. Read by wake(), which see. */
let ranAt = 0;
/** A return that arrived mid-run, whose rows the pull had already read past. */
let woke = false;

/* ---------------------------------------------------------------- the loop */

/** Start again in `ms`, replacing whatever was already queued. */
function schedule(ms: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    runSync();
  }, ms);
}

function backOff() {
  failures += 1;
  report({ state: "offline", unsent: countUnsent() });
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
  if (!session || !session.userId)
    return report({ state: "off", unsent: 0, syncedAt: null });

  // Claimed before the first await, not after. getAccessToken() can spend a
  // network round trip renewing, and a second call arriving in that window
  // would have found `running` still false -- two runs then overwrite each
  // other's cursor and watermark, push the same rows twice, and each clear
  // `dirty`, losing a save that arrived mid-flight. syncAccount()'s
  // schedule(0) landing on a live SOON_MS timer is the real path there.
  running = true;
  dirty = false;
  woke = false;
  report({ state: "syncing" });
  try {
    const token = await getAccessToken();
    // No token and a session means the renewal failed. That is the network's
    // problem, not the user's; try again on the usual schedule.
    if (!token) return backOff();

    useAccount(session.userId);
    const state = syncState();
    const reconcile = reconcileDue();

    const pulled = await pull(
      token,
      reconcile ? 0 : state.cursor,
      state.pushedAt,
    );
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
    if (pulled.applied) emitTasks(getStore().tasks, pulled.overwritten);
    report({ state: "synced", unsent: countUnsent(), syncedAt: Date.now() });
    // A save during the run may have been stamped after push() read the list,
    // and a window focused during it came back after the pull had already
    // asked. Waiting a whole heartbeat for either would look like the sync
    // did not happen.
    schedule(dirty || woke ? SOON_MS : IDLE_MS);
  } catch (err) {
    // Without this the loop stops for good: an exception skips the schedule()
    // above, no timer is left armed, and nothing restarts it until the user
    // happens to make an edit. The chip would sit on "동기화 중" forever and
    // say nothing was wrong.
    console.error("sync failed", err);
    return backOff();
  } finally {
    running = false;
    ranAt = Date.now();
  }
}

/* ------------------------------------------------------------------ public */

/**
 * Point the cursor at an account, clearing it if that is a different one.
 *
 * Logging out passes null, which also clears it -- the next person to log in on
 * this machine must not inherit a cursor that says the account is up to date.
 */
function useAccount(userId: string | null) {
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
function initSync(handlers: Handlers = {}) {
  setHandlers(handlers);
  if (getPublicSession()) report({ state: "syncing", unsent: countUnsent() });
  // Not immediately: the window is still being built, and the first thing a
  // user sees should not be a list rearranging itself.
  schedule(SOON_MS);

  // Coming back to the window, and coming back from sleep. The phone has had
  // both since it was written -- AppState 'active' is one event meaning both --
  // and this side had neither, so a change made on the phone sat unseen for up
  // to a minute while somebody watched the screen it should have appeared on.
  //
  // 'browser-window-focus' rather than a window handle, for the reason
  // updater.ts gives: this module does not know what a BrowserWindow is, and
  // taking one would move the wiring out of main.ts.
  app.on("browser-window-focus", wake);
  // Required here rather than at the top of the file, the way updater.ts does
  // it: powerMonitor is documented as unusable before the app is ready.
  require("electron").powerMonitor.on("resume", wake);
}

/**
 * Somebody came back. Find out what changed while they were away.
 *
 * A laptop that spent the night asleep has stale rows and possibly a dead
 * access token, and this is the moment to find out -- the same reasoning as
 * the heartbeat, at the one moment it is worth not waiting for.
 *
 * A recent run delays this one rather than cancelling it. Dropping it looks
 * equivalent and is not: a heartbeat that finished a second before the phone
 * pushed leaves rows this window has never seen, and refusing the focus that
 * would fetch them hands the person the full minute back -- which is the wait
 * this function exists to remove. Held to WAKE_GAP_MS after the last run, so
 * a burst of focus events still collapses into one.
 */
function wake() {
  if (running) {
    woke = true;
    return;
  }
  schedule(Math.max(0, ranAt + WAKE_GAP_MS - Date.now()));
}

/**
 * Hand the window the list main is holding, whatever it is.
 *
 * Needed when the list changed without a pull having changed it. Signing in and
 * choosing "계정 것만" empties the store here, and the renderer -- still showing
 * the old rows -- would put every one of them back on its next save, because
 * mergeRendererTasks keeps what main does not have. The pull cannot be relied
 * on to cover it: an account with nothing new applies nothing and announces
 * nothing.
 */
function announceTasks() {
  emitTasks(getStore().tasks, 0);
}

/** Something changed locally. Coalesces, so calling it per keystroke is fine. */
function syncSoon() {
  // Counted before the run rather than after: the chip should say "대기 1" the
  // moment something is typed, not three seconds later once a push proved it.
  if (getSyncStatus().state !== "off") report({ unsent: countUnsent() });
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
function syncAccount(userId: string | null) {
  useAccount(userId || null);
  failures = 0;
  if (userId) {
    report({ state: "syncing", unsent: countUnsent(), syncedAt: null });
    schedule(0);
  } else {
    if (timer) clearTimeout(timer);
    report({ state: "off", unsent: 0, syncedAt: null });
  }
}

export { initSync, getSyncStatus, announceTasks, syncSoon, syncAccount };
