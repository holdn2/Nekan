/**
 * Bar or window, and nothing else.
 *
 * Its own module because three things need the answer and none of them should
 * have to import the others to get it: the title bar draws differently, the
 * settings popover has to grow the window before it can open, and app.ts binds
 * Ctrl+M. Keeping it in chrome meant the popover imported the title bar, and
 * the title bar could not then ask the popover to open.
 *
 * Only main decides this. Everything here either reports what it decided or
 * asks it to decide again.
 */

import { notify } from "../render-bus.js";
import { clearSelectionSilently } from "../selection.js";

let mode = "expanded";

/** 'expanded' | 'collapsed'. */
export const getMode = () => mode;

/**
 * Follow the main process into or out of bar mode. Only main.js decides the
 * mode — this repaints for whatever it decided.
 */
export function applyMode(next: string) {
  mode = next;
  // collapse() already dropped the panel's height on its way to the bar, so
  // clear the selection here without asking for another resize.
  if (mode === "collapsed") clearSelectionSilently();
  document.body.classList.toggle("collapsed", mode === "collapsed");
  document.body.classList.toggle("expanded", mode === "expanded");
  notify();
}

/** Ctrl+M, the size button and a double-click on the bar all land here. */
export function toggleSize() {
  if (mode === "collapsed") window.api.expand();
  else window.api.collapse();
}
