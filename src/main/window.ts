/**
 * The one window: creating it and the two modes it has.
 *
 * Two rules run through this file and are easy to break from the outside:
 *
 *   - Only the expanded window's *size* is remembered. Save the bar's and the
 *     next launch opens a 684x48 window with the whole app inside it. The bar
 *     keeps its own position in `barPosition`, position only, for the same
 *     reason.
 *   - Neither mode reopens at a remembered position. Both grow out of where the
 *     window is standing at that moment, so moving the bar and then opening it
 *     opens it where it was left. shared/core.js owns which corner they pivot
 *     on; see expandOrigin() and collapseOrigin().
 *   - Nothing in the page resizes the window. The brain dump and the memo panel
 *     both take their height out of the matrix, in the renderer, so this file
 *     never hears about either of them. It grew the window for the memo panel
 *     until 2026-08-21; docs/DECISIONS.md says why that stopped.
 *
 * The pieces are in window/ beside this file: state holds the window, the mode
 * and the switching flag that keeps a fold from being recorded as the user
 * having moved the widget; create builds it; fold is the two transitions.
 */

export { EXPANDED, BAR, getWindow, getMode } from "./window/state";
export { createWindow } from "./window/create";
export { collapse, expand } from "./window/fold";
