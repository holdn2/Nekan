/**
 * What the loop tells the rest of the app, and the bookmark it keeps.
 *
 * This module never learns what a BrowserWindow is: initSync() hands it two
 * callbacks and that is the entire outward direction. The bookmark -- cursor
 * and push watermark -- lives in settings so it survives a restart, and is
 * cleared when the account changes, because another account's cursor makes
 * this one skip rows it has never seen.
 */

import type { PublicSession } from "../../shared/types";
import { unsentChanges } from "../../shared/sync";
import { getPublicSession } from "../api-client";
import { getSettings, getStore } from "../store";

/** Set by initSync: how a merged list and a status reach the window. */
/** Set by initSync. This module never learns what a BrowserWindow is. */
type Handlers = {
  onTasks?: (tasks: unknown[], overwritten?: unknown) => void;
  onStatus?: (status: any) => void;
};
let onTasks: NonNullable<Handlers["onTasks"]> = () => {};
let onStatus: NonNullable<Handlers["onStatus"]> = () => {};

/**
 * The cursor and watermark, as they sit in settings.sync.
 *
 * Separate from SyncState below, which is what the window is told: this one is
 * bookkeeping that never leaves this process.
 */
interface SyncBookmark {
  userId: string | null;
  cursor: number;
  pushedAt: number;
}

interface SyncState {
  state: string;
  unsent: number;
  syncedAt: number | null;
  session: PublicSession | null;
}

let status: SyncState = {
  state: "off",
  unsent: 0,
  syncedAt: null,
  session: null,
};

/**
 * The session rides along with the status.
 *
 * Not decoration: main can end a session without being asked to, when a refresh
 * comes back 4xx because the token was revoked or the account is gone. Nothing
 * else would tell the window, and it would go on showing an email and a green
 * chip for an account it is no longer talking to. This runs every cycle, so the
 * screen is wrong for at most one heartbeat.
 */
function report(next: Partial<SyncState>) {
  const merged: SyncState = { ...status, session: getPublicSession(), ...next };
  const same = (key: keyof SyncState) =>
    key === "session"
      ? (merged.session && merged.session.email) ===
        (status.session && status.session.email)
      : merged[key] === status[key];
  const watched: (keyof SyncState)[] = [
    "state",
    "unsent",
    "syncedAt",
    "session",
  ];
  if (watched.every(same)) return;
  status = merged;
  onStatus(status);
}

/** Recount what is waiting, from whatever the store holds right now. */
function countUnsent() {
  const state = getSettings().sync as SyncBookmark | undefined;
  return unsentChanges(getStore().tasks, state ? state.pushedAt : 0).length;
}

/** The status the renderer gets at startup, before anything has run. */
function getSyncStatus() {
  return status;
}

/**
 * Cursor and push watermark, kept in settings so they survive a restart.
 *
 * They belong to one account. Signing in as somebody else has to start from
 * nothing, or the other account's cursor would make this one skip every row
 * written before it.
 */
function syncState(): SyncBookmark {
  const settings = getSettings();
  if (!settings.sync) settings.sync = { userId: null, cursor: 0, pushedAt: 0 };
  return settings.sync as SyncBookmark;
}

/**
 * Set once, by initSync(). Absent means a no-op rather than the previous
 * handler, which is how this read before the file was split: initSync is
 * called with both or with neither.
 */
function setHandlers(handlers: Handlers) {
  onTasks = handlers.onTasks || (() => {});
  onStatus = handlers.onStatus || (() => {});
}

/** Hand the window a merged list. Called by the loop and by a finished pull. */
const emitTasks: NonNullable<Handlers["onTasks"]> = (tasks, overwritten) =>
  onTasks(tasks, overwritten);

export type { Handlers, SyncBookmark, SyncState };
export {
  setHandlers,
  emitTasks,
  report,
  countUnsent,
  getSyncStatus,
  syncState,
};
