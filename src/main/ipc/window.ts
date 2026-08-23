/**
 * Bar or window, and the buttons on the title bar.
 *
 * Which mode the window is in is main's, not the renderer's: ready-to-show
 * lands after the renderer has already read state:load, so a bar-mode start is
 * pushed rather than answered.
 */

import { app, ipcMain } from "electron";
import { collapse, expand, getMode, getWindow } from "../window";
import { getSettings, persist, persistNow } from "../store";

function registerWindowIpc() {
  /* ------------------------------------------------------------ window */

  ipcMain.handle("win:collapse", () => {
    collapse();
    return getMode();
  });

  ipcMain.handle("win:expand", () => {
    expand();
    return getMode();
  });

  ipcMain.handle("win:minimize", () => {
    const win = getWindow();
    if (win) win.minimize();
  });

  ipcMain.handle("win:close", () => {
    persistNow();
    app.quit();
  });

  ipcMain.handle("win:togglePin", () => {
    const win = getWindow();
    if (!win) return false;
    const next = !win.isAlwaysOnTop();
    win.setAlwaysOnTop(next);
    getSettings().alwaysOnTop = next;
    persist();
    return next;
  });
}

export { registerWindowIpc };
