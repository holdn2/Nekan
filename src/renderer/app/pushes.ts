/**
 * The four things main sends without being asked, and the race they all share.
 *
 * state:load is a round trip. The mode arrives from ready-to-show, the first
 * update check is seconds away and the first sync three, so any of them can
 * land while that reply is still in flight. Each is applied the moment it
 * arrives *and* kept here, so init() can prefer it over the snapshot: the one
 * that came later is the newer one.
 *
 * Which is why these listeners are registered before the first await. Attached
 * after it, a missed 'win:mode' leaves the window a bar with the expanded
 * layout inside it, and nothing says so.
 */

import type { Task } from "../../shared/types.js";
import { normalizeTasks } from "../../shared/core.js";
import { acceptSynced, setClockOffset } from "../store.js";
import { applyMode } from "../window/mode.js";
import { closeSettings } from "../panels.js";
import { applyUpdateStatus } from "../window/chrome.js";
import {
  announceOverwritten,
  applySession,
  applySyncStatus,
} from "../views/account.js";

type UpdateStatus = Parameters<
  Parameters<typeof window.api.onUpdateStatus>[0]
>[0];
type SyncStatus = Parameters<Parameters<typeof window.api.onSyncStatus>[0]>[0];

/** Last mode pushed by the main process, which outranks the load snapshot. */
let lastMode: string | null = null;
/** Same for the update status, for the same reason. */
let lastUpdate: UpdateStatus | null = null;
/** Same again, for a sync that finished before the load snapshot arrived. */
let lastTasks: Task[] | null = null;
/** And for its status, which is pushed on the same schedule. */
let lastSync: SyncStatus | null = null;

/**
 * Closing the settings popover on the way into a bar. The gear is in the title
 * bar, which the bar keeps, but the popover is sized for the window.
 */
function enterMode(next: string) {
  if (next === "collapsed") closeSettings();
  applyMode(next);
}

/** Bind all four. Call before the first await in init(). */
function listenForPushes() {
  // Registered before the first await: the main process sends 'win:mode' from
  // ready-to-show, and a listener attached later would miss it silently.
  window.api.onMode((next) => {
    lastMode = next;
    enterMode(next);
  });

  // Same race, longer odds: the first update check is seconds away, and the
  // reply below could still be in flight when it lands.
  window.api.onUpdateStatus((next) => {
    lastUpdate = next;
    applyUpdateStatus(next, { announce: true });
  });

  // Same race as the two above, and the same fix: the first sync runs three
  // seconds after launch and the reply below could still be in flight. Both
  // lists come from main's one array, so the later one is the newer one.
  window.api.onSyncTasks((tasks, offset, overwritten) => {
    setClockOffset(offset);
    lastTasks = normalizeTasks(tasks);
    acceptSynced(lastTasks);
    announceOverwritten(overwritten);
  });

  // Carries the session as well as the state. Main can end a session on its
  // own when a token turns out to be revoked, and this is how the guide finds
  // out rather than going on showing an email it no longer has.
  window.api.onSyncStatus((next) => {
    lastSync = next;
    applySession(next.session ?? null);
    applySyncStatus(next);
  });
}

const pushedMode = () => lastMode;
const pushedUpdate = () => lastUpdate;
const pushedTasks = () => lastTasks;
const pushedSync = () => lastSync;

export {
  enterMode,
  listenForPushes,
  pushedMode,
  pushedUpdate,
  pushedTasks,
  pushedSync,
};
