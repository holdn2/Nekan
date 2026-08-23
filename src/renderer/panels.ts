/**
 * Whether the settings popover is open.
 *
 * Apart from the view for the same reason the selection is: two other places
 * need it. The gear that opens it is drawn by the title bar, and app.ts closes
 * it on Escape and on the way into a bar. A view cannot own a state its own
 * button lives outside of.
 */

import { notify } from "./render-bus.js";
import { getMode } from "./window/mode.js";

let open = false;

export const isSettingsOpen = () => open;

export function closeSettings() {
  if (!open) return;
  open = false;
  notify();
}

/**
 * Show the panel, growing the window first if this is a bar.
 *
 * 320px of panel does not fit in 48px of height, and a popover that opened
 * half off-screen would be worse than one that took a moment. The window is
 * main's to resize, so this asks and then opens regardless -- a failed expand
 * should not swallow the click.
 */
export async function openSettings() {
  if (open) return;
  if (getMode() === "collapsed") {
    try {
      await window.api.expand();
    } catch (err) {
      console.error("expand failed", err);
    }
  }
  open = true;
  notify();
}

export function toggleSettings() {
  if (open) closeSettings();
  else void openSettings();
}
