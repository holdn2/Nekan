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
import { STATE_FIELDS, stamp, stateStamp } from "../shared/sync";
import type { LooseTask } from "../shared/sync";

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
/**
 * A buried row carries no content, the same rule mergeOne holds.
 *
 * Spelled out again here rather than leaned on from normalizeTasks, because
 * nothing on this path normalizes: loadStore() does not, and neither does
 * anything between this and the file.
 */
function bury<T>(task: T): T {
  const row = task as Record<string, unknown>;
  if (!row.purgedAt) return task;
  row.text = "";
  row.memo = null;
  return task;
}

function mergeRendererTasks(tasks: unknown) {
  // Rows straight off the wire from the renderer: shaped like tasks, but
  // normalizeTasks has not been over them yet.
  type Incoming = { id: unknown; updatedAt?: unknown; stateAt?: unknown };
  const incoming: Incoming[] = Array.isArray(tasks) ? tasks : [];
  const byId = new Map<string, Incoming>(
    loaded().tasks.map((t: Incoming) => [String(t.id), t]),
  );
  for (const task of incoming) {
    const id = String(task.id);
    const mine = byId.get(id);
    if (!mine) {
      byId.set(id, task);
      continue;
    }
    // Each half on its own, for the reason mergeIncoming gives: the screen may
    // have completed a task whose text a pull has since changed underneath it,
    // and comparing whole rows would drop one of the two. Ties go to the
    // renderer here rather than to the server -- that is what the two sides
    // are, and the screen is the one somebody is looking at.
    const content =
      stamp(task.updatedAt) >=
      stamp((mine as { updatedAt?: unknown }).updatedAt);
    const state =
      stateStamp(task as LooseTask) >= stateStamp(mine as LooseTask);
    // The purge check is the same one mergeOne makes, and for the same
    // reason: the shortcut hands over a row that may be missing a burial the
    // other side is holding.
    if (content && state && !(mine as Record<string, unknown>).purgedAt) {
      byId.set(id, bury({ ...task }));
      continue;
    }
    const merged: Incoming = { ...(content ? task : mine) };
    const from = state ? task : mine;
    const other = state ? mine : task;
    for (const field of STATE_FIELDS) {
      (merged as Record<string, unknown>)[field] =
        (from as Record<string, unknown>)[field] ?? null;
    }
    // A burial is final here too. This is the third place the rule is
    // written, and the one that bites with a single desktop and no phone at
    // all: main can be holding a tombstone a pull just brought in while the
    // screen, which has not seen it yet, saves the same task as merely
    // trashed.
    (merged as Record<string, unknown>).purgedAt =
      (from as Record<string, unknown>).purgedAt ??
      (other as Record<string, unknown>).purgedAt ??
      null;
    // Read rather than copied, for the reason mergeOne gives -- and it bites
    // harder here: loadStore() does not normalize, so a row off disk from
    // before the split has no state stamp at all, and nothing normalizes these
    // on the way out either.
    merged.stateAt = stateStamp(from as LooseTask);
    byId.set(id, bury(merged));
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
