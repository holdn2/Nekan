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
 */

const listeners = [];

/** app.js registers render() here, once. */
export function subscribe(fn) {
  listeners.push(fn);
}

/** Run every subscriber. Safe to call from any module. */
export function notify() {
  listeners.forEach((fn) => fn());
}
