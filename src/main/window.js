/**
 * The one window: creating it, the two modes it has, and the height accounting
 * that keeps the memo panel from stealing from the matrix.
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
 *   - The memo panel is *extra* height, not a slice of the matrix. Opening it
 *     grows the window by what the renderer asks for and closing it hands
 *     exactly that back, so the quadrant ratios never move. `memoDelta` is what
 *     the window actually gained — a display with no room clamps it — and every
 *     saved bound has it subtracted back out. Skip that and the window grows by
 *     the panel height on every restart.
 */

const path = require("path");
const { BrowserWindow, screen } = require("electron");

const { getSettings, persist } = require("./store");
const {
  expandOrigin,
  collapseOrigin,
  needsStartupChoice,
} = require("../shared/core");

/** Where preload.js, the renderer and the icon live, from this folder. */
const SRC = path.join(__dirname, "..");

const EXPANDED = { width: 1000, height: 700, minWidth: 760, minHeight: 520 };
// Wide enough for the whole bar row at comfortable sizes: icon, both halves of
// the 업무/일상 switch, five count chips and every window button. It was 440
// before the switch existed, which left nothing to give, and 600 before the
// update button — which is hidden nearly always but must still fit when it is
// not, because the bar is the mode this widget is usually left in.
const BAR = { width: 640, height: 48 };

/** However tall the renderer asks for, the panel may not take more than this. */
const MEMO_MAX = 400;

let win = null;
let mode = "expanded";
let memoOpen = false;
let memoDelta = 0;
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

/** Window bounds with the memo panel's extra height taken back out. */
function boundsWithoutMemo() {
  const b = win.getBounds();
  return { ...b, height: b.height - memoDelta };
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
  if (mode === "expanded") getSettings().bounds = boundsWithoutMemo();
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

/**
 * Open or close the room the memo panel needs. Returns the resulting state, so
 * the renderer's IPC call gets an answer even when the request was ignored
 * (no window, or a bar, which has no panel).
 */
function setMemoPanel(open, height) {
  if (!win || win.isDestroyed() || mode !== "expanded") return memoOpen;
  if (open === memoOpen) return memoOpen;

  const before = win.getBounds();
  if (open) {
    const want = Math.min(MEMO_MAX, Math.max(0, Math.round(height) || 0));
    win.setBounds(sanitizeBounds({ ...before, height: before.height + want }));
    memoDelta = win.getBounds().height - before.height;
    memoOpen = true;
    win.setMinimumSize(EXPANDED.minWidth, EXPANDED.minHeight + memoDelta);
  } else {
    win.setMinimumSize(EXPANDED.minWidth, EXPANDED.minHeight);
    win.setBounds({
      ...before,
      height: Math.max(EXPANDED.minHeight, before.height - memoDelta),
    });
    memoOpen = false;
    memoDelta = 0;
  }

  // The resize above ran rememberPlacement while memoDelta was mid-update, so
  // the corrected value has to be written after the fact.
  getSettings().bounds = boundsWithoutMemo();
  persist();
  return memoOpen;
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
    },
  });

  win.loadFile(path.join(SRC, "renderer", "index.html"));

  // A reload starts the renderer with nothing selected, so the panel height
  // main is still holding would be stranded — the window would stay tall with
  // no panel in it, and the saved bounds would drift by that much.
  win.webContents.on("did-finish-load", () => {
    if (memoOpen) setMemoPanel(false);
  });

  win.once("ready-to-show", () => {
    win.show();
    // Quitting from bar mode has to come back as the bar, where it was left —
    // the window was just built at the expanded bounds, which is somewhere else.
    //
    // Unless the first-run question is still open. That screen needs the whole
    // window, and this is the only place that can give it: ready-to-show lands
    // after the renderer's state:load has already answered, so a renderer that
    // asks to expand is asking about a bar it has not been told about yet.
    // Anyone upgrading who left the app as a bar arrives here.
    if (settings.mode === "collapsed" && !needsStartupChoice(settings.startupChoice)) {
      collapse(savedBarPosition());
    } else switching = false;
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
 */
function collapse(at) {
  if (!win || mode === "collapsed") return;
  const settings = getSettings();
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
  memoOpen = false;
  memoDelta = 0;
  win.setResizable(false);
  win.setMinimumSize(BAR.width, BAR.height);
  placeWindow(
    sanitizeBounds({ ...origin, width: BAR.width, height: BAR.height }),
    (bar) => {
      settings.barPosition = { x: bar.x, y: bar.y };
    },
  );
  win.webContents.send("win:mode", mode);
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
  win.setMinimumSize(EXPANDED.minWidth, EXPANDED.minHeight);
  win.setResizable(true);
  placeWindow(
    sanitizeBounds({ ...expandOrigin(bar, size, area), ...size }),
    (opened) => {
      settings.bounds = opened;
    },
  );
  win.webContents.send("win:mode", mode);
}

module.exports = {
  EXPANDED,
  BAR,
  createWindow,
  collapse,
  expand,
  setMemoPanel,
  getWindow,
  getMode,
};
