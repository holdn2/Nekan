/**
 * How a React component hears that the screen should be redrawn.
 *
 * The store keeps its own state and mutates it in place; render-bus says when
 * something happened. That arrangement predates React and is worth keeping —
 * it is what stops the store from depending on the view — so the bridge is
 * deliberately thin: subscribe to the same signal app.ts subscribes to, and
 * read the store the same way the imperative renderer reads it.
 *
 * There is no selector here on purpose. useSyncExternalStore compares what
 * getSnapshot returns, so a selector computing `tasks.filter(...)` would hand
 * back a new array every call and React would either re-render forever or warn
 * that the snapshot is not cached. A version number cannot have that problem,
 * and a component that wants derived data just calls the store's own getter in
 * its body — which is exactly what render() does.
 */

import { useSyncExternalStore } from "react";
import { renderVersion, subscribe } from "../render-bus.js";

/**
 * Re-render this component whenever notify() is called.
 *
 * Language counts as a change: setLanguage() calls notify() too, so a component
 * reading t() re-reads it without anyone wiring a second subscription.
 */
export function useRenderSignal(): number {
  return useSyncExternalStore(subscribe, renderVersion);
}
