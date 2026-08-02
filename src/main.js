/**
 * Main-process entry point: app lifecycle and assembly, nothing else.
 *
 * The window, the store and the export each live in src/main/, and this file is
 * what puts them in order — load the data before the window is built, register
 * the IPC before the renderer can call it, and write everything back on the way
 * out.
 */

const { BrowserWindow, app } = require('electron');

const { load, persistNow } = require('./main/store');
const { createWindow } = require('./main/window');
const { registerIpc } = require('./main/ipc');

// Keep the data folder identical between `npm start` and the packaged build.
// Without it the two read different data.json files.
app.setName('EisenhowerMatrix');

// A second launch should raise the window that is already there, not open a
// rival one that would write over the same file.
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
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
    registerIpc();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  // Both quit paths flush the debounced write — otherwise the last few seconds
  // of changes would be lost.
  app.on('window-all-closed', () => {
    persistNow();
    app.quit();
  });

  app.on('before-quit', persistNow);
}
