/**
 * `window.api`, as preload actually built it.
 *
 * Derived rather than described: NekanApi is `typeof api` in preload.ts, so a
 * channel added there is visible here and a channel removed there stops
 * compiling here. The alternative -- a hand-written interface -- is exactly the
 * arrangement core-bridge had, where two lists had to agree and nothing checked
 * that they did.
 *
 * The tokens are still not here, and that is the point of the boundary rather
 * than an omission: preload exposes no way to read one, so no amount of typing
 * gives the renderer access to something it cannot call.
 */
import type { NekanApi } from "../preload.js";

declare global {
  interface Window {
    api: NekanApi;
  }
}
