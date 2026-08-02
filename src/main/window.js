/**
 * The one window: creating it, the two modes it has, and the height accounting
 * that keeps the memo panel from stealing from the matrix.
 *
 * Two rules run through this file and are easy to break from the outside:
 *
 *   - Bounds are only remembered in expanded mode. Save the bar's size and the
 *     next launch opens a 600x48 window with the whole app inside it.
 *   - The memo panel is *extra* height, not a slice of the matrix. Opening it
 *     grows the window by what the renderer asks for and closing it hands
 *     exactly that back, so the quadrant ratios never move. `memoDelta` is what
 *     the window actually gained — a display with no room clamps it — and every
 *     saved bound has it subtracted back out. Skip that and the window grows by
 *     the panel height on every restart.
 */

const path = require('path');
const { BrowserWindow, screen } = require('electron');

const { getSettings, persist } = require('./store');

/** Where preload.js, the renderer and the icon live, from this folder. */
const SRC = path.join(__dirname, '..');

const EXPANDED = { width: 1000, height: 700, minWidth: 760, minHeight: 520 };
// Wide enough for the whole bar row at comfortable sizes: icon, both halves of
// the 업무/일상 switch, five count chips and every window button. It was 440
// before the switch existed, which left nothing to give.
const BAR = { width: 600, height: 48 };

/** However tall the renderer asks for, the panel may not take more than this. */
const MEMO_MAX = 400;

let win = null;
let mode = 'expanded';
let memoOpen = false;
let memoDelta = 0;

const getWindow = () => win;
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

/**
 * Open or close the room the memo panel needs. Returns the resulting state, so
 * the renderer's IPC call gets an answer even when the request was ignored
 * (no window, or a bar, which has no panel).
 */
function setMemoPanel(open, height) {
  if (!win || win.isDestroyed() || mode !== 'expanded') return memoOpen;
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

  // The resize above ran rememberBounds while memoDelta was mid-update, so the
  // corrected value has to be written after the fact.
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
    backgroundColor: settings.theme === 'dark' ? '#1f1e1d' : '#f0eee6',
    icon: path.join(SRC, 'assets', 'icon.ico'),
    alwaysOnTop: settings.alwaysOnTop !== false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(SRC, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(SRC, 'renderer', 'index.html'));

  // A reload starts the renderer with nothing selected, so the panel height
  // main is still holding would be stranded — the window would stay tall with
  // no panel in it, and the saved bounds would drift by that much.
  win.webContents.on('did-finish-load', () => {
    if (memoOpen) setMemoPanel(false);
  });

  win.once('ready-to-show', () => {
    win.show();
    if (settings.mode === 'collapsed') collapse();
  });

  const rememberBounds = () => {
    if (!win || win.isDestroyed() || mode !== 'expanded') return;
    getSettings().bounds = boundsWithoutMemo();
    persist();
  };
  win.on('resize', rememberBounds);
  win.on('move', rememberBounds);

  win.on('closed', () => {
    win = null;
  });

  return win;
}

/** Shrink to the always-on-top bar, keeping the top-left corner in place. */
function collapse() {
  if (!win || mode === 'collapsed') return;
  const settings = getSettings();
  settings.bounds = boundsWithoutMemo();
  const { x, y } = win.getBounds();
  mode = 'collapsed';
  settings.mode = mode;
  // The bar has no memo panel; the renderer drops its selection to match.
  memoOpen = false;
  memoDelta = 0;
  win.setResizable(false);
  win.setMinimumSize(BAR.width, BAR.height);
  win.setBounds({ x, y, width: BAR.width, height: BAR.height });
  win.webContents.send('win:mode', mode);
  persist();
}

/** Back to the remembered expanded bounds, or the defaults if there are none. */
function expand() {
  if (!win || mode === 'expanded') return;
  const settings = getSettings();
  const { x, y } = win.getBounds();
  const target = sanitizeBounds(settings.bounds) || {
    x,
    y,
    width: EXPANDED.width,
    height: EXPANDED.height,
  };
  mode = 'expanded';
  settings.mode = mode;
  win.setMinimumSize(EXPANDED.minWidth, EXPANDED.minHeight);
  win.setResizable(true);
  win.setBounds({
    x: target.x,
    y: target.y,
    width: Math.max(target.width, EXPANDED.minWidth),
    height: Math.max(target.height, EXPANDED.minHeight),
  });
  win.webContents.send('win:mode', mode);
  persist();
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
