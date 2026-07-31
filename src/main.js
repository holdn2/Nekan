const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

const { sanitizeLayout } = require('./shared/core');
const { loadStore, writeStore } = require('./shared/store-io');

// Keep the data folder identical between `npm start` and the packaged build.
app.setName('EisenhowerMatrix');

const EXPANDED = { width: 1000, height: 700, minWidth: 760, minHeight: 520 };
const BAR = { width: 440, height: 48 };

let win = null;
let mode = 'expanded';
let store = null;
let saveTimer = null;

function storePath() {
  return path.join(app.getPath('userData'), 'data.json');
}

function legacyStorePath() {
  return path.join(app.getPath('appData'), 'eisenhower-matrix', 'data.json');
}

function save() {
  writeStore(storePath(), store);
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 200);
}

function persistNow() {
  clearTimeout(saveTimer);
  save();
}

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

function createWindow() {
  const saved = sanitizeBounds(store.settings.bounds);

  win = new BrowserWindow({
    width: saved ? saved.width : EXPANDED.width,
    height: saved ? saved.height : EXPANDED.height,
    x: saved ? saved.x : undefined,
    y: saved ? saved.y : undefined,
    minWidth: EXPANDED.minWidth,
    minHeight: EXPANDED.minHeight,
    frame: false,
    show: false,
    backgroundColor: store.settings.theme === 'dark' ? '#1f1e1d' : '#f0eee6',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    alwaysOnTop: store.settings.alwaysOnTop !== false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.once('ready-to-show', () => {
    win.show();
    if (store.settings.mode === 'collapsed') collapse();
  });

  const rememberBounds = () => {
    if (!win || win.isDestroyed() || mode !== 'expanded') return;
    store.settings.bounds = win.getBounds();
    persist();
  };
  win.on('resize', rememberBounds);
  win.on('move', rememberBounds);

  win.on('closed', () => {
    win = null;
  });
}

function collapse() {
  if (!win || mode === 'collapsed') return;
  store.settings.bounds = win.getBounds();
  const { x, y } = win.getBounds();
  mode = 'collapsed';
  store.settings.mode = mode;
  win.setResizable(false);
  win.setMinimumSize(BAR.width, BAR.height);
  win.setBounds({ x, y, width: BAR.width, height: BAR.height });
  win.webContents.send('win:mode', mode);
  persist();
}

function expand() {
  if (!win || mode === 'expanded') return;
  const { x, y } = win.getBounds();
  const target = sanitizeBounds(store.settings.bounds) || {
    x,
    y,
    width: EXPANDED.width,
    height: EXPANDED.height,
  };
  mode = 'expanded';
  store.settings.mode = mode;
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

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    store = loadStore(storePath(), legacyStorePath());
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    persistNow();
    app.quit();
  });

  app.on('before-quit', persistNow);
}

ipcMain.handle('state:load', () => ({
  tasks: store.tasks,
  settings: store.settings,
  mode,
}));

ipcMain.handle('state:save', (_e, tasks) => {
  store.tasks = Array.isArray(tasks) ? tasks : [];
  persist();
  return true;
});

ipcMain.handle('win:collapse', () => {
  collapse();
  return mode;
});

ipcMain.handle('win:expand', () => {
  expand();
  return mode;
});

ipcMain.handle('win:minimize', () => {
  if (win) win.minimize();
});

ipcMain.handle('win:close', () => {
  persistNow();
  app.quit();
});

ipcMain.handle('settings:theme', (_e, theme) => {
  store.settings.theme = theme === 'dark' ? 'dark' : 'light';
  if (win) {
    win.setBackgroundColor(
      store.settings.theme === 'dark' ? '#1f1e1d' : '#f0eee6'
    );
  }
  persist();
  return store.settings.theme;
});

ipcMain.handle('settings:layout', (_e, layout) => {
  // Same clamp as the renderer's — both sides call the shared helper so the
  // bounds cannot drift apart.
  const next = sanitizeLayout(layout);
  store.settings.layout = next;
  persist();
  return next;
});

ipcMain.handle('win:togglePin', () => {
  if (!win) return false;
  const next = !win.isAlwaysOnTop();
  win.setAlwaysOnTop(next);
  store.settings.alwaysOnTop = next;
  persist();
  return next;
});
