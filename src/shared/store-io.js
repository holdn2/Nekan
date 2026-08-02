/**
 * data.json I/O, kept free of `electron` so the tests can drive it directly.
 * Paths come from the caller (main.js knows where userData lives).
 */

const fs = require('fs');
const path = require('path');

const { DEFAULT_LAYOUT, DEFAULT_SPACE } = require('./core');

function defaultStore() {
  return {
    tasks: [],
    settings: {
      alwaysOnTop: true,
      bounds: null,
      mode: 'expanded',
      theme: 'light',
      // Whether the "다 꺼내기" list above the matrix is unfolded. Collapsed by
      // default so the matrix keeps its full height until it is wanted.
      inboxOpen: false,
      // Which matrix the header toggle is on. Only the choice lives here — the
      // tasks of both boards are in the one `tasks` array, tagged with `space`.
      activeSpace: DEFAULT_SPACE,
      // Quadrant grid ratios: q1/q3's share of the width, q1/q2's of the height.
      layout: { ...DEFAULT_LAYOUT },
    },
  };
}

/** Data written before the app name was pinned lived in a lower-cased folder. */
function migrateLegacyStore(target, legacy) {
  try {
    if (!fs.existsSync(target) && fs.existsSync(legacy)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(legacy, target);
    }
  } catch (err) {
    console.error('legacy store migration failed', err);
  }
}

function loadStore(target, legacy) {
  if (legacy) migrateLegacyStore(target, legacy);
  try {
    const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
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
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmp, target);
    return true;
  } catch (err) {
    console.error('failed to save store', err);
    return false;
  }
}

module.exports = { defaultStore, migrateLegacyStore, loadStore, writeStore };
