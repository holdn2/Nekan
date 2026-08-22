/**
 * The one window: creating it and the two modes it has.
 *
 * Two rules run through this file and are easy to break from the outside:
 *
 *   - Only the expanded window's *size* is remembered. Save the bar's and the
 *     next launch opens a 600x48 window with the whole app inside it. The bar
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
 */

import path from "path";
import { BrowserWindow, screen } from "electron";

import { getSettings, persist } from "./store";
import {
  expandOrigin,
  collapseOrigin,
  needsStartupChoice,
} from "../shared/core";
import type { Point } from "../shared/types";
import { SUPPORTED } from "../shared/i18n/locales";

/** Where preload.js, the renderer and the icon live, from this folder. */
const SRC = path.join(__dirname, "..");

const EXPANDED = { width: 1000, height: 700, minWidth: 760, minHeight: 520 };
// Wide enough for the whole bar row at comfortable sizes: icon, both halves of
// the 업무/일상 switch, five count chips and every window button. It was 440
// before the switch existed, which left nothing to give, and 600 before the
// update button — which is hidden nearly always but must still fit when it is
// not, because the bar is the mode this widget is usually left in.
// 660 rather than 640: the content fits from 617 up, so 640 was never in
// danger, but a bar that ends 6px past its last button reads as full. The
// extra 20px is breathing room, not capacity.
const BAR = { width: 684, height: 48 };

let win = null;
let mode = "expanded";
/**
 * True while the window is being placed by code rather than by the user.
 *
 * setBounds() raises move and resize exactly like a drag does, and saving what
 * comes back feeds the next switch: on a scaled display the measured size is a
 * pixel or two off what was asked for, the right-aligned origin is derived from
 * that size, and the widget walks across the screen a few pixels per toggle.
 * What the placement *intended* is written instead.
 *
 * It starts true because building the window is such a placement — the first
 * resize would otherwise save a size nobody chose. ready-to-show clears it.
 */
let switching = true;

/** The BrowserWindow, or null before it is built / after it closed. */
const getWindow = () => win;
/** 'expanded' | 'collapsed'. Main owns this; the renderer follows. */
const getMode = () => mode;

/** Keep the window inside a visible display, in case a monitor went away. */
function sanitizeBounds(bounds) {
  if (!bounds) return null;
  const area = screen.getDisplayMatching(bounds).workArea;
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  const x = Math.min(Math.max(bounds.x, area.x), area.x + area.width - width);
  const y = Math.min(Math.max(bounds.y, area.y), area.y + area.height - height);
  return { x, y, width, height };
}

/** A saved bar position, or null when there is none worth trusting. */
function savedBarPosition() {
  const at = getSettings().barPosition;
  if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return null;
  return { x: at.x, y: at.y };
}

/** Where the bar was left. Position only — its size is a constant. */
function rememberBarPosition() {
  const { x, y } = win.getBounds();
  getSettings().barPosition = { x, y };
}

/**
 * Save whichever placement the current mode owns: the expanded window keeps
 * size and position, the bar keeps position alone. Bound to move and resize,
 * so dragging either one is remembered.
 */
function rememberPlacement() {
  if (!win || win.isDestroyed() || switching) return;
  if (mode === "expanded") getSettings().bounds = win.getBounds();
  else rememberBarPosition();
  persist();
}

/**
 * Resize the window as part of a mode switch and record what was asked for.
 * The events this raises are ignored — see `switching`.
 */
function placeWindow(bounds, remember) {
  switching = true;
  win.setBounds(bounds);
  remember(bounds);
  persist();
  // A late event from the resize above must not undo the line before it.
  setImmediate(() => {
    switching = false;
  });
}

/** Build the window from the saved settings and show it once it can paint. */
function createWindow() {
  const settings = getSettings();
  const saved = sanitizeBounds(settings.bounds);

  win = new BrowserWindow({
    width: saved ? saved.width : EXPANDED.width,
    height: saved ? saved.height : EXPANDED.height,
    x: saved ? saved.x : undefined,
    y: saved ? saved.y : undefined,
    minWidth: EXPANDED.minWidth,
    minHeight: EXPANDED.minHeight,
    frame: false,
    show: false,
    backgroundColor: settings.theme === "dark" ? "#1f1e1d" : "#f0eee6",
    icon: path.join(SRC, "assets", "icon.ico"),
    alwaysOnTop: settings.alwaysOnTop !== false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(SRC, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // The language, handed over before the window exists. It cannot come
      // through state:load: that is an IPC round trip and lands after the first
      // paint, so the window would show one language for a frame and then swap.
      // preload reads this out of argv synchronously, which is early enough.
      additionalArguments: [
        `--nekan-lang=${settings.language || ""}`,
        `--nekan-langs=${SUPPORTED.join(",")}`,
      ],
    },
  });

  win.loadFile(path.join(SRC, "renderer", "index.html"));

  win.once("ready-to-show", () => {
    win.show();
    // Quitting from bar mode has to come back as the bar, where it was left —
    // the window was just built at the expanded bounds, which is somewhere else.
    //
    // Unless the first-run question is still open, which collapse() refuses.
    // That screen needs the whole window, and only main can give it to it: the
    // renderer's state:load has already been answered by the time this runs, so
    // a renderer asking to expand is asking about a bar nobody told it about.
    // Anyone upgrading who left the app as a bar arrives here.
    if (settings.mode !== "collapsed" || !collapse(savedBarPosition())) {
      switching = false;
    }
  });

  win.on("resize", rememberPlacement);
  win.on("move", rememberPlacement);

  win.on("closed", () => {
    win = null;
  });

  return win;
}

/**
 * Shrink to the always-on-top bar, on whichever side of the display the window
 * is standing (see collapseOrigin). `at` overrides that for the one caller who
 * knows better: startup, restoring where the bar was left.
 *
 * Answers whether the window is now a bar, which ready-to-show needs: a refusal
 * leaves `switching` for that caller to clear.
 */
function collapse(at?: Point | null) {
  if (!win || mode === "collapsed") return false;
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

  mode = "collapsed";
  settings.mode = mode;
  // The bar has no memo panel; the renderer drops its selection to match.
  win.setResizable(false);
  win.setMinimumSize(BAR.width, BAR.height);
  placeWindow(
    sanitizeBounds({ ...origin, width: BAR.width, height: BAR.height }),
    (bar) => {
      settings.barPosition = { x: bar.x, y: bar.y };
    },
  );
  win.webContents.send("win:mode", mode);
  return true;
}

/**
 * Grow back out of the bar, at the bar's *current* position — not the one the
 * window had the last time it was open. The remembered bounds supply the size
 * and nothing else; a bar that has been dragged since opens where it was left.
 */
function expand() {
  if (!win || mode === "expanded") return;
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

  mode = "expanded";
  settings.mode = mode;
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
    (opened) => {
      settings.bounds = opened;
    },
  );
  win.webContents.send("win:mode", mode);
}

export { EXPANDED, BAR, createWindow, collapse, expand, getWindow, getMode };
