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
  backupStore,
  getSettings,
  getStore,
  mergeRendererTasks,
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
const { setMainLanguage } = require("./i18n");
const { storedLanguage } = require("../shared/i18n/locales");
const {
  deleteAccount,
  getClockOffset,
  getPublicSession,
  login,
  loginWithGoogle,
  logout,
} = require("./api-client");
const { cancelSignIn } = require("./oauth");
const {
  announceTasks,
  getSyncStatus,
  syncAccount,
  syncSoon,
} = require("./sync");

/** Where a sign-in puts the local tasks it was asked not to merge. */
const PRE_LOGIN_BACKUP = "data.before-login.json";

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
    clockOffset: getClockOffset(),
    sync: getSyncStatus(),
    // Whether this build offers a password field at all. The guide reads it so
    // a development run can say so out loud instead of looking broken.
    devLogin: !app.isPackaged,
  }));

  // Merged, not replaced: a pull can have landed since the renderer last drew,
  // and those rows are not in the list it is sending back.
  ipcMain.handle("state:save", (_e, tasks) => {
    mergeRendererTasks(tasks);
    persist();
    syncSoon();
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

  // Persisted, and main's own copy follows. No restart and no window rebuild:
  // the argv hand-off exists for the first paint only, and after that i18next
  // can swap catalogues in place on both sides.
  ipcMain.handle("settings:language", (_e, next) => {
    const settings = getSettings();
    settings.language = storedLanguage(next) || settings.language;
    setMainLanguage(settings.language);
    persist();
    return settings.language;
  });

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

  // "sync" or "local", answered once on the first run. Anything else is
  // treated as still-unanswered so a bad value cannot lock the screen away.
  ipcMain.handle("settings:startup", (_e, choice) => {
    const settings = getSettings();
    settings.startupChoice =
      choice === "sync" || choice === "local" ? choice : null;
    // Written now rather than on the debounce, and the write's own answer is
    // returned: the welcome screen holds itself open until this says the
    // choice is on disk, because a screen that closes on an unsaved answer
    // comes back on the next launch having apparently forgotten it.
    const saved = persistNow();
    return saved ? settings.startupChoice : null;
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

  // No channel here returns a token, which is what keeps a compromised
  // renderer from being a stolen account -- credentials never leave this
  // process. They all resolve with `{ ok: false, error }` rather than
  // rejecting: being offline is the normal state of a sync client, not an
  // exception.

  /**
   * What a fresh sign-in does with the tasks already on this machine.
   *
   * "merge" is the ordinary case -- a second machine of one's own, where every
   * local task should end up in the account. "replace" is the one that saves
   * somebody: signing in on a borrowed computer would otherwise push a
   * stranger's list into your account, permanently and invisibly. Even then the
   * rows are copied aside first, because being asked to leave them out is not
   * being asked to destroy them.
   */
  function adoptLocalTasks(mode) {
    if (mode !== "replace") return;
    // Nothing is cleared unless the copy is actually on disk. writeStore can
    // fail -- a full disk, a locked file -- and clearing anyway would destroy
    // the very list this branch exists to preserve. Falling back to a merge
    // sends the tasks up instead, which is not what was asked for but is the
    // only other answer that keeps them.
    if (!backupStore(PRE_LOGIN_BACKUP)) {
      console.error("pre-login backup failed; keeping the local tasks");
      return;
    }
    setTasks([]);
    persistNow();
    // The window is still showing the rows that were just set aside, and its
    // next save would merge every one of them back in. Waiting for the pull to
    // correct it does not work: an account with nothing new applies nothing.
    announceTasks();
  }

  async function afterSignIn(result, mode) {
    if (!result.ok || !result.session) return result;
    // No user id, nothing to scope a sync to -- and syncAccount(null) would
    // quietly turn syncing off, leaving a signed-in app whose tasks never go
    // anywhere. Worse in "replace" mode, where the local list is already
    // aside. Reported as a failed sign-in instead, before anything is moved.
    //
    // The session is dropped too. api-client has already stored it, and saying
    // "로그인하지 못했습니다" while state:load hands the renderer an email is a
    // worse state than either answer on its own.
    if (!result.session.userId) {
      await logout();
      return { ok: false, error: "bad_response" };
    }
    adoptLocalTasks(mode);
    // Resets the cursor, so signing in as somebody else cannot inherit the last
    // account's idea of being up to date.
    syncAccount(result.session.userId);
    return result;
  }

  ipcMain.handle("auth:google", async (_e, mode) =>
    afterSignIn(await loginWithGoogle(), mode),
  );

  // The browser tab is still open and this process is still holding a port.
  ipcMain.handle("auth:cancel", () => cancelSignIn());

  // Password sign-in is a development affordance, not a feature: sync has to be
  // testable without a person clicking a consent screen. Registering it only
  // outside a packaged build means the shipped app has no such channel at all,
  // so the renderer could not use it even if something in there tried.
  if (!app.isPackaged) {
    ipcMain.handle("auth:login", async (_e, email, password, mode) =>
      afterSignIn(
        await login(String(email || ""), String(password || "")),
        mode,
      ),
    );
  }

  // The local tasks stay exactly where they are. They were the user's before
  // there was an account, and this app has to keep working without one.
  ipcMain.handle("auth:logout", async () => {
    const result = await logout();
    syncAccount(null);
    return result;
  });

  // Same promise as logout, and for the same reason: the list on this computer
  // was the user's before there was an account to put it in. Deleting the
  // account is about the copy on the server -- this one stays, and the panel
  // says so before the button is pressed.
  //
  // syncAccount(null) only when the local session was actually ended, which is
  // narrower than "the delete succeeded". It clears the cursor and the push
  // watermark: after a failed delete that would leave a signed-in app that has
  // forgotten how far it had got, and after a delete whose session was replaced
  // mid-flight it would clear those for whoever is signed in *now*.
  ipcMain.handle("account:delete", async () => {
    const result = await deleteAccount();
    if (result.ok && result.signedOut) syncAccount(null);
    return result;
  });
}

module.exports = { registerIpc };
