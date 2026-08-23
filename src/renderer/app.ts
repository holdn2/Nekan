/**
 * Renderer entry point: assemble the modules, draw the first frame, and hold
 * the two things that belong to no single view — the render dispatcher and the
 * keyboard shortcuts.
 *
 * The dependency graph runs one way and ends here:
 *
 *   shared/core ─→ store ─→ views/* ─┐
 *          └─────→ dom  ─→ components/*  ├─→ app.ts
 *                       render-bus ──────┘
 *
 * Nothing imports this file, which is what lets every other module be read on
 * its own.
 */

import { normalizeTasks } from "../shared/core.js";
import { setClockOffset, setTasks } from "./store.js";
import { subscribe } from "./render-bus.js";
import { scheduleDayRollover, watchForDayChange } from "./app/day-rollover.js";
import { wireShortcuts } from "./app/shortcuts.js";
import {
  enterMode,
  listenForPushes,
  pushedMode,
  pushedSync,
  pushedTasks,
  pushedUpdate,
} from "./app/pushes.js";
import { applyStaticStrings, currentLanguage, t } from "./i18n.js";
import { toast } from "./components/toast.js";
import { mountMatrix } from "./views/matrix.js";
import { applyInboxOpen, mountInbox } from "./views/inbox.js";
import { mountArchive } from "./views/archive.js";
import { applySession, applySyncStatus, setDevLogin } from "./views/account.js";
import { mountMemo } from "./views/memo.js";
import { dropStaleSelection } from "./selection.js";
import { mountSettings } from "./views/settings.js";
import {
  mountWelcome,
  needsWelcome,
  showWelcome,
  wireWelcome,
} from "./views/welcome.js";
import {
  applyPinned,
  applySpace,
  applyTheme,
  applyUpdateStatus,
  applyVersion,
  mountChrome,
} from "./window/chrome.js";
import { setLayout, wireMemoEdge, wireQuadEdges } from "./window/layout.js";
import { wireDragAndDrop } from "./window/dnd.js";

/* -------------------------------------------------------------- rendering */

/**
 * What is left of the one redraw.
 *
 * It used to rebuild the whole visible tab, and every view is a component now
 * -- each subscribes to the same signal this does and decides for itself
 * whether it is on screen. What could not move is this: the selected id has to
 * be forgotten when its task is completed, trashed or dragged out of the
 * matrix, and no single view owns that.
 *
 * The panel does not depend on it having run. selectedTask() answers null for
 * a task in any of those states, so the panel closes on the state; this only
 * stops the id from lingering behind it.
 */
function render() {
  dropStaleSelection();
}

/* ------------------------------------------------------------------- init */

/**
 * Load, wire, draw. The order is what matters here: the mode listener before
 * the first await, the store before anything reads it, and the wiring before
 * the render that applyMode() triggers at the end.
 */
async function init() {
  // Before the first await, and before anything is drawn. The language came in
  // on argv precisely so this does not have to wait for state:load — putting it
  // after would show one language for a frame and then swap it.
  document.documentElement.lang = currentLanguage();
  applyStaticStrings();

  // Registered before the first await. Main sends 'win:mode' from
  // ready-to-show, and a listener attached after this point misses it in
  // silence -- see the note in app/pushes.ts.
  listenForPushes();

  const state = await window.api.load();
  setClockOffset(state.clockOffset);
  setTasks(normalizeTasks(pushedTasks() || state.tasks));
  // Every change ends on the render bus, so this one subscription is what keeps
  // the screen in step with the data.
  subscribe(render);

  applyVersion(state.version);
  applyTheme(state.settings?.theme || "light", false);
  applyPinned(state.settings?.alwaysOnTop !== false);
  applyInboxOpen(state.settings?.inboxOpen === true, false);
  applySpace(state.settings?.activeSpace, false);
  setLayout(state.settings?.layout);

  setDevLogin(state.devLogin);
  mountSettings();
  // The session follows the same rule as the mode and the update status: a
  // value that was pushed while load() was in flight is the newer one, and
  // state.auth would otherwise put a signed-out snapshot back on screen.
  applySession(pushedSync() ? (pushedSync()!.session ?? null) : state.auth);
  applySyncStatus(pushedSync() || state.sync);

  mountChrome();
  mountInbox();
  mountMatrix();
  mountWelcome();
  mountArchive();
  mountMemo();
  wireShortcuts();
  watchForDayChange();
  wireDragAndDrop();
  wireQuadEdges();
  wireMemoEdge();

  // Before the first render, so nobody sees a matrix flash behind it. The
  // wiring above has to be done first: this screen can sign in, and a sign-in
  // pushes tasks and a status back at us.
  wireWelcome(() => {});
  // 380px of card does not fit in a 48px bar, but nothing is done about it
  // here: main keeps the window expanded while the question is open. Asking
  // from this side cannot work — ready-to-show, and so the collapse, lands
  // after state:load has answered, so the mode read here still says expanded
  // and the bar arrives as a push a moment later.
  if (needsWelcome(state.settings?.startupChoice)) showWelcome();

  // No announce: this is the state as it already stood, and a reload arrives
  // here too. Whatever landed as a push above has announced itself already.
  applyUpdateStatus(pushedUpdate() || state.update);
  // state.mode is a snapshot from before ready-to-show, so a mode that was
  // pushed in the meantime is the newer truth. This is also the first render.
  enterMode(pushedMode() || state.mode || "expanded");
  scheduleDayRollover();
  releaseSwitches();
}

/**
 * Let the two switches animate, now that they are where they belong.
 *
 * The saved board and theme are applied well after the first paint -- the load
 * is an IPC round trip -- so without this the pill would visibly slide in from
 * the left on every launch that did not end on the left-hand choice.
 *
 * Reading a layout property first is the whole trick: it forces the applied
 * state to be computed while transitions are still off, so dropping the class
 * afterwards cannot be batched into the same recalculation as the change it is
 * meant to hide. A requestAnimationFrame would not be enough -- its callback
 * runs before the frame's style pass, so both could still land together.
 */
function releaseSwitches() {
  void document.body.offsetHeight;
  document.body.classList.remove("booting");
}

// A rejected state:load would otherwise skip every step after it and leave the
// window showing unwired static markup, with nothing but an unhandled rejection
// in a devtools console the user does not have open.
init().catch((err) => {
  console.error("renderer init failed", err);
  toast(t("app.startFailed"), {
    error: true,
    ms: 20000,
  });
});
