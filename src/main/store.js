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

const path = require('path');
const { app } = require('electron');

const { loadStore, writeStore } = require('../shared/store-io');
const { dropExpiredTombstones } = require('../shared/core');

let store = null;
let saveTimer = null;

/**
 * Where the data lives. app.setName() in main.js pins the folder name, so
 * `npm start` and the packaged exe read the same file.
 */
function storePath() {
  return path.join(app.getPath('userData'), 'data.json');
}

/**
 * Folders this data has lived in before, newest first.
 *
 * `EisenhowerMatrix` is what app.setName() pinned before the rename to Nekan;
 * `eisenhower-matrix` is older still, from before the name was pinned at all.
 * Both are kept because a user can be sitting on either one.
 */
function legacyStorePaths() {
  const appData = app.getPath('appData');
  return [
    path.join(appData, 'EisenhowerMatrix', 'data.json'),
    path.join(appData, 'eisenhower-matrix', 'data.json'),
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
const getStore = () => store;
/** Settings only; the half every module here actually touches. */
const getSettings = () => store.settings;

/** Replace the task list with what the renderer just sent. */
function setTasks(tasks) {
  store.tasks = Array.isArray(tasks) ? tasks : [];
}

/** Write now, through store-io's temp-file + rename. */
function save() {
  writeStore(storePath(), store);
}

/** Write soon — coalesces a burst of changes into one file write. */
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 200);
}

/** Write immediately, cancelling any pending debounce. For quit paths. */
function persistNow() {
  clearTimeout(saveTimer);
  save();
}

module.exports = {
  storePath,
  legacyStorePaths,
  load,
  getStore,
  getSettings,
  setTasks,
  persist,
  persistNow,
};
