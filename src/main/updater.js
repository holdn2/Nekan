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
 * When it asks is a policy in itself: shortly after launch, whenever the user
 * comes back to the app or the machine wakes, and every six hours regardless.
 * The first two are what stop a widget left running for a week from being the
 * last to hear; the last is the floor under them.
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
/** The floor: however quiet the machine is, no longer than this between asks. */
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
/**
 * And the ceiling on the other side: coming back to the app asks, but never
 * more often than this. Focus arrives every time the widget is clicked, which
 * for something that sits on screen all day is far too many requests to send
 * GitHub for an answer that changes every few weeks.
 */
const MIN_GAP_MS = 30 * 60 * 1000;

/**
 * What the updater currently knows:
 *
 *   idle        nothing has been checked -- an unpackaged run, or the moments
 *               before the first check. Also where a *failed* check lands.
 *   checking    a check is in flight
 *   latest      a check came back and there is nothing newer
 *   downloading something newer is on its way
 *   ready       it is downloaded and waiting for a restart
 *
 * `idle` and `latest` are deliberately different. They look the same from the
 * outside -- no new version -- but only one of them means anybody actually
 * asked. Collapsing them would let the guide tab claim "최신입니다" when the
 * check had failed, which is the one thing a version display must not do.
 *
 * This does not reopen the decision in #9 that the title bar shows only
 * `ready`. A button offering a restart that cannot happen is a dead button;
 * a sentence in a tab someone opened on purpose is not.
 */
let status = { state: "idle", version: null, checkedAt: null };
let notify = () => {};
/**
 * When we last *asked*, which is not `status.checkedAt` — that only moves when
 * an answer comes back, so a run of failed checks would leave it still and let
 * every wake-up ask again. Throttling has to count attempts.
 */
let askedAt = 0;

/** The last thing the updater learnt, for state:load to hand a fresh renderer. */
const getUpdateStatus = () => status;

function setStatus(state, version = null) {
  status = {
    state,
    version,
    // Only a state that came back from the server is evidence of a check.
    checkedAt:
      state === "latest" || state === "ready" ? Date.now() : status.checkedAt,
  };
  notify(status);
}

/**
 * Ask. Every rejection here has already gone through the 'error' handler below
 * — electron-updater emits before it throws — so catching it a second time is
 * about not leaving an unhandled rejection behind, not about reporting.
 */
function check() {
  askedAt = Date.now();
  autoUpdater.checkForUpdates().catch(() => {});
}

/**
 * Ask, unless we just did — or unless there is already a version on disk, which
 * no answer can improve on.
 *
 * Everything after the first check comes through here, the six-hour timer
 * included: a timer firing a minute after the user came back from lunch has
 * nothing new to learn. That makes six hours the longest gap rather than the
 * only one.
 */
function checkIfDue() {
  if (status.state === "ready") return;
  if (Date.now() - askedAt < MIN_GAP_MS) return;
  check();
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

  // A version already downloaded outranks anything a later check says: it is on
  // disk and installable, and a check that fails afterwards cannot take it back.
  const unlessReady = (fn) => (info) => {
    if (status.state !== "ready") fn(info);
  };

  autoUpdater.on(
    "checking-for-update",
    unlessReady(() => setStatus("checking")),
  );
  autoUpdater.on(
    "update-not-available",
    unlessReady(() => setStatus("latest")),
  );
  autoUpdater.on(
    "update-available",
    unlessReady((info) => setStatus("downloading", info.version)),
  );
  autoUpdater.on("update-downloaded", (info) =>
    setStatus("ready", info.version),
  );
  autoUpdater.on("error", (err) => {
    console.error("update failed", err?.message || err);
    // Back to not knowing. It must not fall through to `latest` -- that would
    // be the app telling someone they are up to date because it failed to ask.
    if (status.state !== "ready") setStatus("idle");
  });

  // Startup counts as having just asked, so that showing the window — which
  // raises a focus event of its own — cannot pull the first check in front of
  // FIRST_CHECK_MS. That timer calls check() directly and is unaffected.
  askedAt = Date.now();

  setTimeout(check, FIRST_CHECK_MS);
  setInterval(checkIfDue, CHECK_EVERY_MS);

  // A widget that is never closed used to learn about a release up to six hours
  // late, while quitting and reopening told it in ten seconds. These are the two
  // moments where someone is plausibly *coming back* to the app, and they cost
  // nothing while it sits idle.
  //
  // Both hang off `app`, not off a window: this file still knows nothing about
  // BrowserWindow, and 'browser-window-focus' fires for whichever window exists
  // without anyone having to hand one over.
  app.on("browser-window-focus", checkIfDue);
  // setInterval does not run while the machine is asleep and does not catch up
  // afterwards, so a laptop closed overnight comes back with its timer still
  // hours from firing.
  //
  // Required here rather than at the top of the file: powerMonitor is documented
  // as unusable before the app is ready, and this file is required from main.js
  // well before that.
  require("electron").powerMonitor.on("resume", checkIfDue);
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
