/**
 * Auto-update against GitHub Releases.
 *
 * The widget is meant to sit on screen for days at a time, so nothing here ever
 * interrupts. The check and the download run in the background and the new
 * version is applied on quit either way (`autoInstallOnAppQuit`) — the only
 * thing the user ever sees is a button offering to bring that restart forward.
 * That is also why there is no "downloading" state on screen: a button that
 * appears mid-download would promise a restart it cannot yet deliver.
 *
 * Failures are swallowed on purpose. No network, no release published yet, a
 * rate-limited API — none of those are the user's problem, and a window that is
 * always on top complaining about them every six hours is worse than one that
 * stays quiet.
 */

const { app } = require("electron");
const { autoUpdater } = require("electron-updater");

/** Long enough after startup that the first paint has the machine to itself. */
const FIRST_CHECK_MS = 10 * 1000;
/** And how often after that, for a window that may never be closed. */
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/** 'idle' until something is downloaded, then 'ready' with the version. */
let status = { state: "idle", version: null };
let notify = () => {};

/** The last thing the updater learnt, for state:load to hand a fresh renderer. */
const getUpdateStatus = () => status;

function setStatus(state, version = null) {
  status = { state, version };
  notify(status);
}

/**
 * Ask. Every rejection here has already gone through the 'error' handler below
 * — electron-updater emits before it throws — so catching it a second time is
 * about not leaving an unhandled rejection behind, not about reporting.
 */
function check() {
  autoUpdater.checkForUpdates().catch(() => {});
}

/**
 * Start checking. `onStatus` is called whenever the state changes; main.js
 * passes one that forwards it to the renderer, so this file needs to know
 * nothing about windows.
 */
function initUpdater(onStatus) {
  notify = typeof onStatus === "function" ? onStatus : () => {};

  // An unpackaged run has no app-update.yml to read a feed out of, and nobody
  // wants `npm start` replacing itself with a release build.
  if (!app.isPackaged) return;

  // Both are already the defaults. They are spelled out because they *are* the
  // policy this file exists to implement.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-downloaded", (info) =>
    setStatus("ready", info.version),
  );
  autoUpdater.on("error", (err) => {
    console.error("update failed", err?.message || err);
    // A download that died must not leave a button behind, but one that already
    // finished is still installable — a later failed check cannot take it back.
    if (status.state !== "ready") setStatus("idle");
  });

  setTimeout(check, FIRST_CHECK_MS);
  setInterval(check, CHECK_EVERY_MS);
}

/**
 * Apply the downloaded version now. Silent and relaunching, so "재시작" means
 * the widget comes back by itself rather than dropping the user into an
 * installer they have to click through.
 */
function installUpdate() {
  if (status.state !== "ready") return false;
  // Out of the IPC handler first: quitting inside it would tear the channel
  // down before the renderer gets its reply.
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
  return true;
}

module.exports = { initUpdater, getUpdateStatus, installUpdate };
