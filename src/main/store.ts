/**
 * The main process's copy of data.json, and when it gets written.
 *
 * This is the authoritative task list: every renderer change arrives through
 * `state:save`, so `store.tasks` is always what is on screen — which is why the
 * export builds its document from here rather than asking the renderer for one.
 *
 * Writes are debounced. Dragging a quadrant edge or typing in a memo produces a
 * burst of changes, and each one would otherwise be a temp-write plus a rename.
 * Anything that must not be lost (quit, close) calls persistNow() instead.
 */

import fs from "fs";
import path from "path";
import { app } from "electron";

import { loadStore, writeStore } from "./store-io";
import type { Task } from "../shared/types";
import type { Store } from "./store-io";
import { dropExpiredTombstones } from "../shared/core";
import { stamp } from "../shared/sync";

let store: Store | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * The store, or a loud failure.
 *
 * Everything below runs after load(), and did before this said so -- reading
 * `store.settings` off null is a crash either way. The difference is that this
 * one names what went wrong instead of saying "cannot read properties of
 * null", which is what a caller that skipped load() would otherwise get.
 */
function loaded(): Store {
  if (!store) throw new Error("store read before load()");
  return store;
}

/**
 * Where the data lives. app.setName() in main.js pins the folder name, so
 * `npm start` and the packaged exe read the same file.
 */
function storePath() {
  return path.join(app.getPath("userData"), "data.json");
}

/**
 * Folders this data has lived in before, newest first.
 *
 * `EisenhowerMatrix` is what app.setName() pinned before the rename to Nekan;
 * `eisenhower-matrix` is older still, from before the name was pinned at all.
 * Both are kept because a user can be sitting on either one.
 */
function legacyStorePaths() {
  const appData = app.getPath("appData");
  return [
    path.join(appData, "EisenhowerMatrix", "data.json"),
    path.join(appData, "eisenhower-matrix", "data.json"),
  ];
}

/**
 * Read the file (migrating an older folder's first) and keep it in memory.
 *
 * Startup is where tombstones are collected: a permanently deleted row stays
 * in the file so other devices learn it is gone, and this is the one moment
 * where dropping the expired ones cannot race a write in progress.
 */
function load() {
  store = loadStore(storePath(), legacyStorePaths());
  store.tasks = dropExpiredTombstones(store.tasks);
  return store;
}

/** The whole store object — tasks and settings. */
const getStore = () => loaded();
/** Settings only; the half every module here actually touches. */
const getSettings = () => loaded().settings;

/** Replace the task list outright. Used by sync, which merged already. */
function setTasks(tasks: unknown) {
  loaded().tasks = Array.isArray(tasks) ? tasks : [];
}

/**
 * Take the renderer's list, keeping anything sync applied underneath it.
 *
 * A plain replace was right while this file was the only writer. It is not any
 * more: a pull can land between the renderer's last draw and its next save, and
 * the save would then write a list that never had those rows in it.
 *
 * Merging is safe because a task is never removed from the array -- deleting is
 * a timestamp, so there is no such thing as a save that legitimately drops a
 * row. Ties go to the renderer: it is the copy the user is looking at.
 */
function mergeRendererTasks(tasks: unknown) {
  // Rows straight off the wire from the renderer: shaped like tasks, but
  // normalizeTasks has not been over them yet.
  type Incoming = { id: unknown; updatedAt?: unknown };
  const incoming: Incoming[] = Array.isArray(tasks) ? tasks : [];
  const byId = new Map<string, Incoming>(
    loaded().tasks.map((t: Incoming) => [String(t.id), t]),
  );
  for (const task of incoming) {
    const id = String(task.id);
    const mine = byId.get(id);
    if (!mine || stamp(task.updatedAt) >= stamp(mine.updatedAt)) {
      byId.set(id, task);
    }
  }
  // Shape-blind on purpose: this function compares timestamps and nothing
  // else, so it works in `Incoming` rather than in Task. They are tasks by the
  // time they get here -- the renderer normalises its list before it can send
  // one, and load() normalises what came off disk -- and this is where that
  // knowledge is written down rather than assumed.
  loaded().tasks = [...byId.values()] as Task[];
}

/** How many times one backup name may be reused before giving up. */
const BACKUP_LIMIT = 20;

/**
 * Copy the whole store aside, next to the live one, without ever overwriting.
 *
 * Used when someone signs in and chooses to keep only the account's tasks. The
 * local ones are not deleted, because "이 컴퓨터 것은 빼주세요" and "지워주세요"
 * are not the same sentence and only one of them is undoable.
 *
 * Which is exactly why the name has to be free. Signing in this way twice --
 * sign in, log out, sign in again -- would otherwise have the second backup
 * land on the first, and the first list would be gone for good under a
 * function whose whole job is not losing it. `-2`, `-3` and so on are appended
 * until a free name turns up.
 *
 * Returns the path written, or null. Null means the caller must not delete
 * anything: a backup that did not happen is not a backup.
 */
function backupStore(name: string) {
  const dir = app.getPath("userData");
  const dot = name.lastIndexOf(".");
  const stem = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? "" : name.slice(dot);

  for (let n = 1; n <= BACKUP_LIMIT; n += 1) {
    const target = path.join(dir, n === 1 ? name : `${stem}-${n}${ext}`);
    try {
      if (fs.existsSync(target)) continue;
    } catch {
      return null;
    }
    return writeStore(target, loaded()) ? target : null;
  }
  return null;
}

/** Write now, through store-io's temp-file + rename. Answers whether it landed. */
function save() {
  return writeStore(storePath(), loaded());
}

/** Write soon — coalesces a burst of changes into one file write. */
function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 200);
}

/** Write immediately, cancelling any pending debounce. For quit paths. */
function persistNow() {
  if (saveTimer) clearTimeout(saveTimer);
  return save();
}

export {
  storePath,
  legacyStorePaths,
  load,
  getStore,
  getSettings,
  setTasks,
  mergeRendererTasks,
  backupStore,
  persist,
  persistNow,
};
