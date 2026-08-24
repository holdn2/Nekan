/**
 * Main-process entry point: app lifecycle and assembly, nothing else.
 *
 * The window, the store and the export each live in src/main/, and this file is
 * what puts them in order — load the data before the window is built, register
 * the IPC before the renderer can call it, and write everything back on the way
 * out.
 */

import { BrowserWindow, app } from "electron";

import { getSettings, load, persistNow } from "./main/store";
import { initI18n } from "./main/i18n";
import { pickLanguage, storedLanguage } from "./shared/i18n/locales";
import { createWindow, getWindow } from "./main/window";
import { registerIpc } from "./main/ipc";
import { initUpdater } from "./main/updater";
import { getClockOffset, initAuth } from "./main/api-client";
import { initSync } from "./main/sync";

// Keep the data folder identical between `npm start` and the packaged build.
// Without it the two read different data.json files.
app.setName("Nekan");

// A second launch should raise the window that is already there, not open a
// rival one that would write over the same file.
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    // Order matters: the window reads its bounds, theme and mode from the
    // store, and the renderer calls IPC as soon as it loads.
    load();
    // Before the window, which hands the language to preload on the command
    // line -- the only channel that arrives before the first paint. A machine
    // that has never chosen gets Korean if the OS is Korean and English
    // otherwise, and the answer is written down so the OS cannot change it
    // under a user who has since picked for themselves.
    const settings = getSettings();
    settings.language =
      storedLanguage(settings.language) || pickLanguage(app.getLocale());
    initI18n(settings.language as string | undefined);
    // Before the IPC, because state:load hands the renderer whoever is logged
    // in and the answer comes off disk. safeStorage needs the app ready, which
    // is why this cannot sit next to the store load above.
    initAuth();
    registerIpc();
    createWindow();
    // Last, and knowing nothing about windows itself: this is the wire from the
    // updater to whichever window is on screen when it has news.
    initUpdater((status: unknown) => {
      const win = getWindow();
      if (win && !win.isDestroyed())
        win.webContents.send("update:status", status);
    });
    // Same arrangement, same reason: sync knows nothing about windows, and this
    // is the one wire from a finished pull to whatever is on screen. The clock
    // offset rides along because it was learned by the same request.
    const toWindow = (channel: string, ...args: unknown[]) => {
      const win = getWindow();
      if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
    };
    initSync({
      onTasks: (tasks, overwritten) =>
        toWindow("sync:tasks", tasks, getClockOffset(), overwritten),
      onStatus: (status) => toWindow("sync:status", status),
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  // Both quit paths flush the debounced write — otherwise the last few seconds
  // of changes would be lost.
  app.on("window-all-closed", () => {
    persistNow();
    app.quit();
  });

  app.on("before-quit", persistNow);
}
