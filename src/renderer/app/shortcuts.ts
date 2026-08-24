/**
 * The keyboard, for the things that are not a button anywhere.
 *
 * Only accelerator combinations are handled here -- Cmd on macOS, Ctrl
 * everywhere else; see keys.ts. Escape belongs to whichever panel is open and
 * is bound by that panel, which is why closing the settings popover is not in
 * this file.
 */

import { $ } from "../dom.js";
import { accel } from "../keys.js";
import { focusInbox } from "../views/inbox.js";
import { setTab, toggleTheme } from "../window/chrome.js";
import { getMode, toggleSize } from "../window/mode.js";
import { closeSettings } from "../panels.js";
import { exportBoard } from "../window/export-ui.js";

/**
 * The global keys. They live here rather than in the modules they drive
 * because each one crosses two of them (a tab *and* a focus, a mode *and* a
 * guard), and because one listener is easier to keep consistent than six.
 */
function wireShortcuts() {
  document.addEventListener("keydown", (e) => {
    // Every shortcut here is the accelerator + one key. Which key that is, and
    // why AltGr and Option are ruled out, is keys.ts.
    if (!accel(e)) return;

    if (e.key.toLowerCase() === "m") {
      e.preventDefault();
      toggleSize();
      return;
    }
    if (e.key.toLowerCase() === "e") {
      e.preventDefault();
      // Nothing on screen to export from a bar, and the save dialog would open
      // over a window with no board behind it.
      if (getMode() === "collapsed") return;
      closeSettings();
      exportBoard();
      return;
    }
    if (e.key.toLowerCase() === "d") {
      e.preventDefault();
      toggleTheme();
      return;
    }
    // 0 continues the 1~4 run: it is the "not sorted yet" slot.
    if (e.key === "0") {
      e.preventDefault();
      if (getMode() === "collapsed") return;
      setTab("matrix");
      focusInbox();
      return;
    }
    if (["1", "2", "3", "4"].includes(e.key)) {
      e.preventDefault();
      if (getMode() === "collapsed") return;
      setTab("matrix");
      $(`[data-add="q${e.key}"] input[type="text"]`)?.focus();
    }
  });
}

export { wireShortcuts };
