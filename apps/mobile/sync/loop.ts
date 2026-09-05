/**
 * When syncing happens.
 *
 * The schedule is the desktop's with one substitution: that one wakes on
 * window focus and on the machine resuming from sleep, and a phone has one
 * event that means both -- the app coming to the front. Everything else is
 * the same, including the part that matters most.
 *
 * The cursor is thrown away and the whole account re-read at start-up and
 * every RECONCILE_MS. `server_seq` is handed out inside a transaction, so a
 * row that committed first can carry a *larger* number than one that
 * committed after it; a pull landing in that gap skips a row for good. The
 * merge is last-write-wins, so re-reading changes nothing except the number of
 * requests -- which is why the fix is affordable and why removing it would
 * cost a task every so often, in a way nobody could reproduce.
 */
import { AppState, type AppStateStatus } from "react-native";
import { accessToken, currentSession, sessionEpoch } from "../api/session";
import {
  allTasks,
  saveSyncState,
  subscribe,
  syncState,
  useAccount,
} from "../store/state";
import { unsentChanges } from "@nekan/shared/sync";
import type { Task } from "@nekan/shared/types";
import { pull, push } from "./transfer";

/** After an edit: soon enough to feel immediate, late enough to batch. */
const SOON_MS = 3000;
/** Nothing happening. */
const IDLE_MS = 60_000;
/** After a failure, in order. The last one repeats. */
const RETRY_MS = [5000, 20_000, 60_000, 300_000];
/** How often the cursor is thrown away and everything read back. */
const RECONCILE_MS = 6 * 60 * 60 * 1000;

export type SyncPhase = "off" | "syncing" | "synced" | "offline";

export interface SyncStatus {
  phase: SyncPhase;
  unsent: number;
  syncedAt: number | null;
  /**
   * How many edits this device had not sent yet and lost to another device's
   * newer copy.
   *
   * Counted and shown rather than swallowed. Network trouble stays quiet
   * because there is nothing to do about it; this is different -- it is the
   * one sync outcome a person can neither see nor undo, and "what I wrote is
   * gone" with no explanation is worse than the loss itself. Merging is per
   * row, not per field, so editing a task's text here while its note changed
   * there means one whole row wins.
   */
  overwritten: number;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let dirty = false;
let failures = 0;
let reconciledAt = 0;
let status: SyncStatus = {
  phase: "off",
  unsent: 0,
  syncedAt: null,
  overwritten: 0,
};
let listeners: ((s: SyncStatus) => void)[] = [];

export function onSyncStatus(fn: (s: SyncStatus) => void): () => void {
  listeners.push(fn);
  fn(status);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

function report(next: Partial<SyncStatus>) {
  status = { ...status, ...next };
  for (const fn of listeners) fn(status);
}

const countUnsent = () =>
  unsentChanges(allTasks() as Task[], syncState().pushedAt).length;

function schedule(ms: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void run();
  }, ms);
}

function backOff() {
  report({ phase: "offline", unsent: countUnsent() });
  const wait = RETRY_MS[Math.min(failures, RETRY_MS.length - 1)];
  failures += 1;
  schedule(wait);
}

/** Whether the cursor is due to be thrown away. See the note at the top. */
const reconcileDue = () => Date.now() - reconciledAt >= RECONCILE_MS;

async function run(): Promise<void> {
  if (running) return;
  const session = currentSession();
  if (!session?.userId) {
    report({ phase: "off", unsent: 0 });
    return;
  }

  running = true;
  dirty = false;
  report({ phase: "syncing" });
  // Claimed before the first await. Signing out cancels the timer but cannot
  // cancel a request already in the air, and the rest of this run would then
  // spend a token the person has just revoked: push their rows, write the old
  // account's cursor, and arm the next run. Every step after an await asks
  // whether it is still the same session first.
  const startedAt = sessionEpoch();
  const ours = () => sessionEpoch() === startedAt;
  try {
    const token = await accessToken();
    if (!ours()) return;
    // No token while signed in means the renewal failed. That is the network's
    // problem rather than the person's; try again on the usual schedule.
    if (!token) return backOff();

    useAccount(session.userId);
    const state = syncState();
    const reconcile = reconcileDue();

    const pulled = await pull(
      token,
      reconcile ? 0 : state.cursor,
      state.pushedAt,
    );
    if (!ours()) return;
    state.cursor = Math.max(state.cursor, pulled.cursor);
    if (!pulled.ok) {
      saveSyncState(state);
      return backOff();
    }
    if (reconcile) reconciledAt = Date.now();

    const pushed = await push(token, session.userId, state.pushedAt);
    if (!ours()) return;
    state.pushedAt = pushed.pushedAt;
    saveSyncState(state);
    if (!pushed.ok) return backOff();

    failures = 0;
    report({
      phase: "synced",
      unsent: countUnsent(),
      syncedAt: Date.now(),
      // Adds up across runs until something acknowledges it: a count that
      // reset on the next heartbeat would be gone before it was read.
      overwritten: status.overwritten + pulled.overwritten,
    });
    // A save during the run may have been stamped after `push` read the list.
    // Waiting a whole heartbeat for it would look like the edit did not sync.
    schedule(dirty ? SOON_MS : IDLE_MS);
  } catch (err) {
    // Without this the loop stops for good: an exception skips the schedule
    // above, no timer is left armed, and nothing restarts it until somebody
    // happens to make an edit. The status would sit on "syncing" forever and
    // say nothing was wrong.
    console.error("sync failed", err);
    return backOff();
  } finally {
    running = false;
  }
}

/* ------------------------------------------------------------------ public */

/**
 * Go now. Signing in is the caller: the loop reports "off" and stops
 * scheduling when nobody is signed in, so something has to wake it when
 * somebody is.
 */
export function syncNow(): void {
  schedule(0);
}

/** Something changed locally: go soon rather than at the next heartbeat. */
export function syncSoon(): void {
  dirty = true;
  report({ unsent: countUnsent() });
  if (!running) schedule(SOON_MS);
}

/**
 * Start the loop, and keep it awake with the app.
 *
 * Coming to the front is a phone's version of both events the desktop waits
 * for: a window regaining focus, and a machine waking up. A device that spent
 * the night asleep has stale rows and possibly a dead access token, and this
 * is the moment to find out.
 */
export function startSync(): () => void {
  // The cursor is dropped at start-up, not only every six hours. See the top.
  reconciledAt = 0;
  schedule(0);
  const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
    if (next === "active") schedule(0);
  });
  // Any change to the board is a reason to go soon. A pull that applied rows
  // trips this too, which costs one extra cycle that finds nothing pending --
  // cheaper than a second signal saying which changes were local.
  const stop = subscribe(syncSoon);
  return () => {
    sub.remove();
    stop();
    if (timer) clearTimeout(timer);
    timer = null;
  };
}

/** The person has seen the count; stop carrying it. */
export function clearOverwritten(): void {
  if (status.overwritten) report({ overwritten: 0 });
}

/** Signing out stops the loop and clears what it was showing. */
export function stopSync(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  failures = 0;
  report({ phase: "off", unsent: 0, syncedAt: null, overwritten: 0 });
}
