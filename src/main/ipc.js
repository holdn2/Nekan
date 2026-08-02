/**
 * Every `ipcMain.handle` in one place — the main-process half of preload.js.
 *
 * Adding a channel means touching three files and this is the first: the handler
 * here, the bridge in preload.js, and the `window.api.*` call in the renderer.
 * Miss one and the call fails silently at runtime.
 *
 * Handlers stay thin on purpose. Each one validates what came over the wire,
 * calls into store/window/export, and returns the value the renderer needs —
 * the logic lives in those modules, not here.
 */

const { app, ipcMain } = require('electron');

const { sanitizeLayout, sanitizeSpace } = require('../shared/core');
const { getSettings, getStore, persist, persistNow, setTasks } = require('./store');
const {
  collapse,
  expand,
  getMode,
  getWindow,
  setMemoPanel,
} = require('./window');
const { revealExport, runExport } = require('./export-service');

/** Bind every channel. Called once, before the window is created. */
function registerIpc() {
  /* ------------------------------------------------------------- state */

  ipcMain.handle('state:load', () => ({
    tasks: getStore().tasks,
    settings: getSettings(),
    mode: getMode(),
  }));

  ipcMain.handle('state:save', (_e, tasks) => {
    setTasks(tasks);
    persist();
    return true;
  });

  /* ------------------------------------------------------------ window */

  ipcMain.handle('win:collapse', () => {
    collapse();
    return getMode();
  });

  ipcMain.handle('win:expand', () => {
    expand();
    return getMode();
  });

  ipcMain.handle('win:minimize', () => {
    const win = getWindow();
    if (win) win.minimize();
  });

  ipcMain.handle('win:close', () => {
    persistNow();
    app.quit();
  });

  ipcMain.handle('win:memo', (_e, open, height) => setMemoPanel(!!open, height));

  ipcMain.handle('win:togglePin', () => {
    const win = getWindow();
    if (!win) return false;
    const next = !win.isAlwaysOnTop();
    win.setAlwaysOnTop(next);
    getSettings().alwaysOnTop = next;
    persist();
    return next;
  });

  /* ---------------------------------------------------------- settings */

  ipcMain.handle('settings:theme', (_e, theme) => {
    const settings = getSettings();
    settings.theme = theme === 'dark' ? 'dark' : 'light';
    const win = getWindow();
    if (win) {
      win.setBackgroundColor(
        settings.theme === 'dark' ? '#1f1e1d' : '#f0eee6'
      );
    }
    persist();
    return settings.theme;
  });

  ipcMain.handle('settings:layout', (_e, layout) => {
    // Same clamp as the renderer's — both sides call the shared helper so the
    // bounds cannot drift apart.
    const next = sanitizeLayout(layout);
    getSettings().layout = next;
    persist();
    return next;
  });

  // Unlike the memo panel, the inbox takes its height from the matrix instead
  // of growing the window, so there is nothing to resize here — only the fold
  // state to remember.
  ipcMain.handle('settings:inbox', (_e, open) => {
    const settings = getSettings();
    settings.inboxOpen = !!open;
    persist();
    return settings.inboxOpen;
  });

  // Which matrix the header toggle is showing. Nothing moves in the store:
  // every task carries its own `space`, so switching boards is purely a filter
  // in the renderer and only the choice has to survive a restart.
  ipcMain.handle('settings:space', (_e, space) => {
    const settings = getSettings();
    settings.activeSpace = sanitizeSpace(space);
    persist();
    return settings.activeSpace;
  });

  /* ------------------------------------------------------------ export */

  ipcMain.handle('export:run', () => runExport(getWindow()));
  ipcMain.handle('export:reveal', (_e, target) => revealExport(target));
}

module.exports = { registerIpc };
