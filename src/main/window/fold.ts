/**
 * Folding the window into the bar and opening it back out.
 *
 * Both start from a saved value, never from win.getBounds(). A read-back
 * bounds is a pixel or two off the requested one on a scaled display, and
 * using it as the origin of the next move walks the widget across the screen a
 * few pixels per round trip.
 *
 * Which corner they pivot on is shared/core's expandOrigin/collapseOrigin, and
 * the pair has to ask the same question or a round trip does not land where it
 * started -- test/ sweeps every starting position for exactly that.
 */

import { BAR, EXPANDED } from "./state";
import {
  getMode,
  getWindow,
  placeWindow,
  savedBarPosition,
  sanitizeBounds,
  setMode,
} from "./state";
import type { Point, Rect } from "../../shared/types";
import {
  collapseOrigin,
  expandOrigin,
  needsStartupChoice,
} from "../../shared/core";
import { screen } from "electron";
import { getSettings } from "../store";

/**
 * Shrink to the always-on-top bar, on whichever side of the display the window
 * is standing (see collapseOrigin). `at` overrides that for the one caller who
 * knows better: startup, restoring where the bar was left.
 *
 * Answers whether the window is now a bar, which ready-to-show needs: a refusal
 * leaves `switching` for that caller to clear.
 */
function collapse(at?: Point | null) {
  const win = getWindow();
  if (!win || getMode() === "collapsed") return false;
  const settings = getSettings();
  // Not while the first-run question is up. That screen covers the window, so a
  // bar shows nothing but the icon -- and it covers the title bar with it, so
  // there is no button left to undo this with. Ctrl+M reached here even though
  // the overlay had the button underneath it; refusing is what closes every
  // route at once, rather than guessing which ones exist.
  if (needsStartupChoice(settings.startupChoice)) return false;
  // The store, not the OS, says where the window is. Every user move and resize
  // wrote `bounds`, and expand() wrote what it asked for; asking the window
  // instead returns what the display rounded that to, and folding from a
  // rounded number and then opening from the rounded result of *that* walks the
  // widget across the screen a few pixels per toggle.
  const from = sanitizeBounds(settings.bounds) || win.getBounds();
  const area = screen.getDisplayMatching(from).workArea;
  const origin = at || collapseOrigin(from, BAR, area);

  setMode("collapsed");
  // The bar has no memo panel; the renderer drops its selection to match.
  win.setResizable(false);
  win.setMinimumSize(BAR.width, BAR.height);
  placeWindow(
    sanitizeBounds({ ...origin, width: BAR.width, height: BAR.height }),
    (bar: Rect) => {
      settings.barPosition = { x: bar.x, y: bar.y };
    },
  );
  win.webContents.send("win:mode", getMode());
  return true;
}

/**
 * Grow back out of the bar, at the bar's *current* position — not the one the
 * window had the last time it was open. The remembered bounds supply the size
 * and nothing else; a bar that has been dragged since opens where it was left.
 */
function expand() {
  const win = getWindow();
  if (!win || getMode() === "expanded") return;
  const settings = getSettings();
  // Where the bar was put, for the same reason collapse() reads the store.
  const at = savedBarPosition();
  const bar = at
    ? { ...at, width: BAR.width, height: BAR.height }
    : win.getBounds();
  const saved = sanitizeBounds(settings.bounds);
  const size = {
    width: Math.max(saved ? saved.width : EXPANDED.width, EXPANDED.minWidth),
    height: Math.max(
      saved ? saved.height : EXPANDED.height,
      EXPANDED.minHeight,
    ),
  };
  const area = screen.getDisplayMatching(bar).workArea;

  setMode("expanded");
  // After setResizable, not before. On Windows, turning resizing off stashes
  // the current minimum and turning it back on restores it, so a minimum set
  // first is overwritten by whatever was in force when the bar was folded. It
  // makes no difference while that is always EXPANDED.minHeight, which is the
  // only value this file uses -- but the day anything raises the minimum, the
  // window comes back out of the bar stuck at the old one. Measured on
  // 2026-08-21, when the memo panel briefly did exactly that.
  win.setResizable(true);
  win.setMinimumSize(EXPANDED.minWidth, EXPANDED.minHeight);
  placeWindow(
    sanitizeBounds({ ...expandOrigin(bar, size, area), ...size }),
    (opened: Rect) => {
      settings.bounds = opened;
    },
  );
  win.webContents.send("win:mode", getMode());
}

export { collapse, expand };
