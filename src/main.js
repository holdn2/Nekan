/**
 * Main-process entry point: app lifecycle and assembly, nothing else.
 *
 * The window, the store and the export each live in src/main/, and this file is
 * what puts them in order — load the data before the window is built, register
 * the IPC before the renderer can call it, and write everything back on the way
 * out.
 */

const { BrowserWindow, app } = require("electron");

const { load, persistNow } = require("./main/store");
const { createWindow, getWindow } = require("./main/window");
const { registerIpc } = require("./main/ipc");
const { initUpdater } = require("./main/updater");
const { getClockOffset, initAuth } = require("./main/api-client");
const { initSync } = require("./main/sync");

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
    // Before the IPC, because state:load hands the renderer whoever is logged
    // in and the answer comes off disk. safeStorage needs the app ready, which
    // is why this cannot sit next to the store load above.
    initAuth();
    registerIpc();
    createWindow();
    // Last, and knowing nothing about windows itself: this is the wire from the
    // updater to whichever window is on screen when it has news.
    initUpdater((status) => {
      const win = getWindow();
      if (win && !win.isDestroyed())
        win.webContents.send("update:status", status);
    });
    // Same arrangement, same reason: sync knows nothing about windows, and this
    // is the one wire from a finished pull to whatever is on screen. The clock
    // offset rides along because it was learned by the same request.
    initSync((tasks) => {
      const win = getWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send("sync:tasks", tasks, getClockOffset());
      }
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
