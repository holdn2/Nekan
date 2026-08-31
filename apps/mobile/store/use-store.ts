/**
 * The screens' way in.
 *
 * `useSyncExternalStore` rather than a context: the store is a module, not a
 * tree, and nothing has to be provided from above for a screen to read it.
 * The snapshot is a version number because every selector rebuilds its array
 * -- returning a list would compare unequal on every render and never settle.
 */
import { useSyncExternalStore } from "react";
import { getVersion, subscribe } from "./state";

/** Re-renders the caller whenever the board changes. Reads happen after. */
export function useStore(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}
