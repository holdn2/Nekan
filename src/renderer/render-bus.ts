/**
 * "Something changed — redraw."
 *
 * The store and a few view modules need to trigger a render, but the renderer
 * itself lives in app.js, which imports *them*. Importing back would close a
 * cycle, so the signal goes through here instead: app.js subscribes once at
 * startup and everyone else just calls notify().
 *
 * It is deliberately not an event emitter with topics. There is one screen and
 * one render() — anything finer would be a way to redraw half of it and let the
 * other half drift.
 *
 * Two things arrive on this one wire, and both matter: a change to the tasks,
 * and a change of language (setLanguage calls notify). Anything subscribing
 * here is therefore already subscribed to both.
 */

/** A Set, not an array: React subscribes and unsubscribes as it mounts. */
const listeners = new Set<() => void>();

/**
 * How many times the screen has been told to redraw.
 *
 * The store mutates its task array in place, so nothing about its identity
 * changes when a task does — which is fine for a render() that reads the array
 * afresh, and useless to React, whose useSyncExternalStore compares snapshots.
 * This counter is the snapshot: a plain number that is different afterwards.
 */
let version = 0;

/** app.js registers render() here. Returns the way to take it back off. */
export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The current redraw count. Changes exactly when notify() is called. */
export function renderVersion() {
  return version;
}

/** Run every subscriber. Safe to call from any module. */
export function notify() {
  version += 1;
  // Copied first: a subscriber may unsubscribe while this is running, and
  // mutating the Set underneath the iteration would skip whoever came next.
  for (const fn of [...listeners]) fn();
}
