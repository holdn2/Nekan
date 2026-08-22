/**
 * data.json I/O, kept free of `electron` so the tests can drive it directly.
 * Paths come from the caller (main.js knows where userData lives).
 */

import fs from "fs";
import path from "path";

import { DEFAULT_LAYOUT, DEFAULT_SPACE } from "../shared/core";

/** A first-run store: no tasks, and the settings every reader assumes exist. */
function defaultStore() {
  return {
    tasks: [],
    settings: {
      alwaysOnTop: true,
      bounds: null,
      mode: "expanded",
      theme: "light",
      // Whether the "다 꺼내기" list above the matrix is unfolded. Collapsed by
      // default so the matrix keeps its full height until it is wanted.
      inboxOpen: false,
      // Which matrix the header toggle is on. Only the choice lives here — the
      // tasks of both boards are in the one `tasks` array, tagged with `space`.
      activeSpace: DEFAULT_SPACE,
      // What the first-run screen was answered with: "sync", "local", or null
      // for "not asked yet". Null is what puts that screen on screen, so an
      // existing 1.0.2 file — which has no such key — meets it once too. That
      // is deliberate: sync is new and nobody goes looking for a feature they
      // do not know exists.
      startupChoice: null,
      // Which language the interface is in. Null means "never chosen", and main
      // settles it from the OS locale at startup -- Korean if the machine is
      // Korean, English otherwise. Stored per machine rather than synced, the
      // same way the window bounds and the board are: a work PC and a home PC
      // can differ, and none of these describe the tasks.
      language: null,
      // Where the bar was left, so quitting from bar mode and coming back does
      // not reopen it at the expanded window's corner. Position only — the bar
      // has one size and saving it would reopen the app 600x48.
      barPosition: null,
      // Quadrant grid ratios: q1/q3's share of the width, q1/q2's of the height.
      layout: { ...DEFAULT_LAYOUT },
    },
  };
}

/**
 * Bring a data.json written under an older app name across, once.
 *
 * `legacy` may be a list because the folder has moved twice: before the app
 * name was pinned it was lower-cased, and the rename to Nekan moved it again.
 * The list is walked newest-first and the first file that exists wins, so a
 * user who has both folders keeps the more recent one.
 *
 * Never copies over an existing target — that would overwrite live data with
 * a stale copy on every launch.
 */
function migrateLegacyStore(target, legacy) {
  const sources = (Array.isArray(legacy) ? legacy : [legacy]).filter(Boolean);
  try {
    if (fs.existsSync(target)) return;
    const source = sources.find((p) => fs.existsSync(p));
    if (!source) return;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  } catch (err) {
    console.error("legacy store migration failed", err);
  }
}

/**
 * Read data.json, falling back to the defaults for a missing or corrupt file.
 * Merging settings over the defaults is what lets a new setting be added
 * without an older file losing it.
 */
function loadStore(target, legacy) {
  if (legacy && legacy.length) migrateLegacyStore(target, legacy);
  try {
    const parsed = JSON.parse(fs.readFileSync(target, "utf8"));
    const base = defaultStore();
    return {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      settings: { ...base.settings, ...(parsed.settings || {}) },
    };
  } catch {
    return defaultStore();
  }
}

/**
 * Write through a temp file + rename so an interrupted write can never leave
 * a truncated data.json behind (that would silently wipe every task).
 */
function writeStore(target, store) {
  const tmp = `${target}.tmp`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
    fs.renameSync(tmp, target);
    return true;
  } catch (err) {
    console.error("failed to save store", err);
    return false;
  }
}

export { defaultStore, migrateLegacyStore, loadStore, writeStore };
