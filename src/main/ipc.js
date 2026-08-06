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

const { app, ipcMain, shell } = require("electron");

/** Where the guide tab's link goes. The only URL this process will open. */
const RELEASES_URL = "https://github.com/holdn2/Nekan/releases";

const { sanitizeLayout, sanitizeSpace } = require("../shared/core");
const {
  getSettings,
  getStore,
  persist,
  persistNow,
  setTasks,
} = require("./store");
const {
  collapse,
  expand,
  getMode,
  getWindow,
  setMemoPanel,
} = require("./window");
const { revealExport, runExport } = require("./export-service");
const { getUpdateStatus, installUpdate } = require("./updater");
const { getPublicSession, login, logout, signup } = require("./api-client");

/** Bind every channel. Called once, before the window is created. */
function registerIpc() {
  /* ------------------------------------------------------------- state */

  // `mode` and `update` ride along for the same reason: both are main's to
  // decide and both are also pushed, so a renderer that starts (or reloads)
  // after the fact still has the current answer without asking for it.
  //
  // `version` rides along because it would be a whole channel for one string
  // that never changes while the app is running. It comes from app.getVersion()
  // rather than package.json: in a packaged build that file is a copy inside
  // the asar, and this is the number electron is actually running.
  //
  // `auth` is the email of whoever is logged in, or null -- never a token.
  // It rides along for the same reason as the rest: it is main's to know, it
  // is restored from disk before the window exists, and a renderer that
  // reloads has to be able to find out again without a channel of its own.
  ipcMain.handle("state:load", () => ({
    tasks: getStore().tasks,
    settings: getSettings(),
    mode: getMode(),
    update: getUpdateStatus(),
    version: app.getVersion(),
    auth: getPublicSession(),
  }));

  ipcMain.handle("state:save", (_e, tasks) => {
    setTasks(tasks);
    persist();
    return true;
  });

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

  ipcMain.handle("win:memo", (_e, open, height) =>
    setMemoPanel(!!open, height),
  );

  ipcMain.handle("win:togglePin", () => {
    const win = getWindow();
    if (!win) return false;
    const next = !win.isAlwaysOnTop();
    win.setAlwaysOnTop(next);
    getSettings().alwaysOnTop = next;
    persist();
    return next;
  });

  /* ---------------------------------------------------------- settings */

  ipcMain.handle("settings:theme", (_e, theme) => {
    const settings = getSettings();
    settings.theme = theme === "dark" ? "dark" : "light";
    const win = getWindow();
    if (win) {
      win.setBackgroundColor(settings.theme === "dark" ? "#1f1e1d" : "#f0eee6");
    }
    persist();
    return settings.theme;
  });

  ipcMain.handle("settings:layout", (_e, layout) => {
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
  ipcMain.handle("settings:inbox", (_e, open) => {
    const settings = getSettings();
    settings.inboxOpen = !!open;
    persist();
    return settings.inboxOpen;
  });

  // Which matrix the header toggle is showing. Nothing moves in the store:
  // every task carries its own `space`, so switching boards is purely a filter
  // in the renderer and only the choice has to survive a restart.
  ipcMain.handle("settings:space", (_e, space) => {
    const settings = getSettings();
    settings.activeSpace = sanitizeSpace(space);
    persist();
    return settings.activeSpace;
  });

  /* ------------------------------------------------------------ export */

  ipcMain.handle("export:run", () => runExport(getWindow()));
  ipcMain.handle("export:reveal", (_e, target) => revealExport(target));

  /* ------------------------------------------------------------ update */

  // Quits the app on the way through, so there is nothing useful to return
  // beyond "there was something to install".
  ipcMain.handle("update:install", () => installUpdate());

  // Takes no argument on purpose. A handler that opened whatever URL the
  // renderer passed would be a way to launch anything the moment a task's text
  // could reach it; this one can only ever open the releases page.
  ipcMain.handle("update:notes", () => shell.openExternal(RELEASES_URL));

  /* -------------------------------------------------------------- auth */

  // These three are the whole surface. There is no channel that returns a
  // token, which is what keeps a compromised renderer from being a stolen
  // account -- the credentials never leave this process.
  //
  // They resolve with `{ ok: false, error }` rather than rejecting: being
  // offline is the normal state of a sync client, not an exception.
  ipcMain.handle("auth:login", (_e, email, password) =>
    login(String(email || ""), String(password || "")),
  );

  ipcMain.handle("auth:signup", (_e, email, password) =>
    signup(String(email || ""), String(password || "")),
  );

  ipcMain.handle("auth:logout", () => logout());
}

module.exports = { registerIpc };
