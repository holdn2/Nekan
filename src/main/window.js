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
  MAX_MEMO_PX,
  clampMemoPanel,
  expandOrigin,
  collapseOrigin,
  needsStartupChoice,
} = require("../shared/core");
const { SUPPORTED } = require("../shared/i18n/locales");

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

/**
 * The last rectangle this file asked the window for.
 *
 * `switching` covers a placement for one turn of the event loop, which is
 * enough for a mode switch but not for a drag: the memo panel's edge sends a
 * resize every frame, and a resize event arriving 5ms late lands after the
 * flag has already been cleared. Saving what the window measures then is the
 * feedback loop this whole file is written to avoid -- on a scaled display the
 * measurement is a pixel or two off what was asked for, and that becomes the
 * base of the next resize.
 *
 * Comparing against what we asked for catches those echoes without a timer to
 * get stuck on: anything that does not match is the user, and gets saved.
 */
let placedAt = null;

/** Same rectangle, near enough. The slack is the scaled-display rounding. */
const samePlacement = (a, b) =>
  a &&
  b &&
  Math.abs(a.x - b.x) <= 4 &&
  Math.abs(a.y - b.y) <= 4 &&
  Math.abs(a.width - b.width) <= 4 &&
  Math.abs(a.height - b.height) <= 4;

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
  if (samePlacement(win.getBounds(), placedAt)) return;
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
  placedAt = bounds;
  win.setBounds(bounds);
  remember(bounds);
  persist();
  // A late event from the resize above must not undo the line before it.
  setImmediate(() => {
    switching = false;
  });
}

/** What the panel is doing, and how much height it actually got for it. */
const memoState = () => ({ open: memoOpen, height: memoDelta });

/**
 * The tallest the panel may be asked to be on this display right now.
 *
 * Only main can answer it -- it is the screen's height minus the window
 * without the panel -- and the renderer needs it before a drag starts, or the
 * drag would keep asking for height the display cannot give and the panel
 * would end up taller than the room the window gained for it.
 */
function memoRoom() {
  if (!win || win.isDestroyed() || mode !== "expanded") return MAX_MEMO_PX;
  const base = sanitizeBounds(getSettings().bounds) || win.getBounds();
  const area = screen.getDisplayMatching(base).workArea;
  return Math.max(0, area.height - base.height);
}

/**
 * Open, close or resize the room the memo panel needs. Returns the resulting
 * state, so the renderer's IPC call gets an answer even when the request was
 * ignored (no window, or a bar, which has no panel).
 */
function setMemoPanel(open, height) {
  if (!win || win.isDestroyed() || mode !== "expanded") return memoState();
  // Opening an open panel is a resize, which is what a drag on its top edge
  // sends -- dozens of times a second, with no transition anywhere in it.
  // Closing a closed one is still nothing.
  if (!open && !memoOpen) return memoState();

  // The store, not the window — the same rule the mode switch follows, and for
  // the same reason. setBounds and getBounds do not round-trip on a scaled
  // display, so measuring the window and then building the next resize on that
  // measurement compounds: at 125% this grew the window 4px wider and ~1px
  // taller per open/close pair, wrote the result to disk, and never stopped.
  // `bounds` is by definition the window without the panel, which is the base
  // both branches want.
  const base = sanitizeBounds(getSettings().bounds) || win.getBounds();
  // Written by both branches, so a resize raised mid-switch cannot save a size
  // that is halfway through this.
  const keepBase = () => {
    getSettings().bounds = base;
  };

  if (open) {
    const want = clampMemoPanel(height, memoRoom());
    // Opening pins the top edge and grows downwards; resizing pins the bottom
    // and moves the top. Both are "the base rectangle plus some extra", but a
    // drag has the user's finger on the divider, and a divider that does not
    // follow the cursor reads as a dead handle. Pinning the bottom makes the
    // matrix slide up by exactly what the panel gains, so the edge stays under
    // the pointer.
    //
    // The anchor needs no separate bookkeeping: `base` and `memoDelta` are
    // rewritten together on every call, so base.y + base.height + memoDelta is
    // the same screen pixel for as long as the drag lasts.
    const bottom = base.y + base.height + memoDelta;
    const target = memoOpen
      ? { ...base, y: bottom - (base.height + want), height: base.height + want }
      : { ...base, height: base.height + want };
    // What the display had room for, taken from the request rather than from
    // the window afterwards.
    const grown = sanitizeBounds(target);
    memoDelta = Math.max(0, grown.height - base.height);
    memoOpen = true;
    // The base moves with the window: it is this rectangle without the panel,
    // and after a bottom-pinned resize its top-left is the window's.
    const nextBase = { ...grown, height: base.height };
    placeWindow(grown, () => {
      getSettings().bounds = nextBase;
    });
    // Capped at the display: EXPANDED.minHeight plus a fully dragged panel is
    // 920px, and a minimum taller than the screen leaves a window that cannot
    // be shrunk back down.
    const area = screen.getDisplayMatching(grown).workArea;
    win.setMinimumSize(
      EXPANDED.minWidth,
      Math.min(EXPANDED.minHeight + memoDelta, area.height),
    );
  } else {
    win.setMinimumSize(EXPANDED.minWidth, EXPANDED.minHeight);
    memoOpen = false;
    memoDelta = 0;
    placeWindow(
      sanitizeBounds({
        ...base,
        height: Math.max(EXPANDED.minHeight, base.height),
      }),
      keepBase,
    );
  }
  return memoState();
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
function collapse(at) {
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
  // After setResizable, not before. On Windows turning resizing off stashes
  // the current minimum and turning it back on restores it -- so a minimum set
  // first is overwritten by whatever was in force when the bar was folded. That
  // was invisible while the minimum was always EXPANDED.minHeight; the memo
  // panel's drag raises it, and the window came back out of the bar stuck at
  // 520 plus however tall the panel had been dragged.
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

module.exports = {
  EXPANDED,
  BAR,
  createWindow,
  collapse,
  expand,
  setMemoPanel,
  memoRoom,
  getWindow,
  getMode,
};
