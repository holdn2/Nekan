/**
 * The window itself, the mode it is in, and the bookkeeping that keeps its
 * position honest.
 *
 * `switching` is the reason these three live together. Every programmatic move
 * raises resize and move events, and saving those would record the app's own
 * doing as the user's -- so it is set for the duration of a move and
 * rememberPlacement() ignores anything that arrives while it is on. Splitting
 * the flag away from the functions it guards is how that stops being true.
 *
 * Only the expanded size is ever saved. Storing the bar's would open the app
 * at 684x48 next time, so a bar keeps its position and nothing else.
 */

import path from "node:path";
import { BrowserWindow, screen } from "electron";
import type { Point, Rect } from "../../shared/types";
import { getSettings, persist } from "../store";

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

let win: BrowserWindow | null = null;
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

/**
 * Keep the window inside a visible display, in case a monitor went away.
 *
 * Takes `unknown` because that is what it is handed: these come out of
 * data.json, which anyone can edit and an older version wrote. A rectangle
 * missing a number would otherwise reach setBounds and open the window
 * somewhere nobody can see.
 */
function sanitizeBounds(bounds: unknown): Rect | null {
  if (!isRect(bounds)) return null;
  const area = screen.getDisplayMatching(bounds).workArea;
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  const x = Math.min(Math.max(bounds.x, area.x), area.x + area.width - width);
  const y = Math.min(Math.max(bounds.y, area.y), area.y + area.height - height);
  return { x, y, width, height };
}

/** Four finite numbers. Anything else is not a rectangle. */
function isRect(value: unknown): value is Rect {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (["x", "y", "width", "height"] as const).every((k) =>
    Number.isFinite(r[k]),
  );
}

/** A saved bar position, or null when there is none worth trusting. */
function savedBarPosition(): Point | null {
  const at = getSettings().barPosition as Point | undefined;
  if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return null;
  return { x: at.x, y: at.y };
}

/** Where the bar was left. Position only — its size is a constant. */
function rememberBarPosition() {
  if (!win) return;
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
function placeWindow(bounds: Rect | null, remember: (bounds: Rect) => void) {
  if (!win || !bounds) return;
  switching = true;
  win.setBounds(bounds);
  remember(bounds);
  persist();
  // A late event from the resize above must not undo the line before it.
  setImmediate(() => {
    switching = false;
  });
}

/** Assigned by createWindow, cleared when the window closes. */
function setWindow(next: BrowserWindow | null) {
  win = next;
}

/** Set by collapse()/expand() once the move has actually been made. */
function setMode(next: string) {
  mode = next;
  getSettings().mode = next;
}

/**
 * Open and close the window on a move of the app's own making.
 *
 * Everything between them is invisible to rememberPlacement, which is what
 * keeps a fold from being recorded as the user having moved the widget.
 */
const beginSwitch = () => {
  switching = true;
};
const endSwitch = () => {
  switching = false;
};

export {
  SRC,
  EXPANDED,
  BAR,
  getWindow,
  getMode,
  setWindow,
  setMode,
  beginSwitch,
  endSwitch,
  sanitizeBounds,
  savedBarPosition,
  rememberBarPosition,
  rememberPlacement,
  placeWindow,
};
