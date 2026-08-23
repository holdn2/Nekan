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

import {
  normalizeTasks,
  startOfToday,
  startOfTomorrow,
} from "../shared/core.js";
import type { Task } from "../shared/types.js";

/** The two shapes main pushes. Read off window.api so they cannot drift. */
type UpdateStatus = Parameters<
  Parameters<typeof window.api.onUpdateStatus>[0]
>[0];
type SyncStatus = Parameters<Parameters<typeof window.api.onSyncStatus>[0]>[0];
import { acceptSynced, setClockOffset, setTasks } from "./store.js";
import { subscribe } from "./render-bus.js";
import { applyStaticStrings, currentLanguage, t } from "./i18n.js";
import { $ } from "./dom.js";
import { toast } from "./components/toast.js";
import { mountMatrix } from "./views/matrix.js";
import {
  applyInboxOpen,
  focusInbox,
  mountInbox,
  wireInbox,
} from "./views/inbox.js";
import { mountArchive } from "./views/archive.js";
import {
  announceOverwritten,
  applySession,
  applySyncStatus,
  renderAccount,
  setDevLogin,
  wireAccount,
} from "./views/account.js";
import { mountMemo } from "./views/memo.js";
import { dropStaleSelection } from "./selection.js";
import { closeSettings, wireSettings } from "./views/settings.js";
import {
  mountWelcome,
  needsWelcome,
  showWelcome,
  wireWelcome,
} from "./views/welcome.js";
import {
  applyMode,
  applyPinned,
  applySpace,
  applyTheme,
  applyUpdateStatus,
  applyVersion,
  getMode,
  getTab,
  relabelChrome,
  renderCounts,
  setTab,
  toggleSize,
  toggleTheme,
  wireChrome,
} from "./window/chrome.js";
import { setLayout, wireMemoEdge, wireQuadEdges } from "./window/layout.js";
import { wireDragAndDrop } from "./window/dnd.js";
import { exportBoard } from "./window/export-ui.js";

/* -------------------------------------------------------------- rendering */

/**
 * The one redraw. Everything that changes anything ends up here through the
 * render bus, and it always rebuilds the whole visible tab — there is no
 * partial update that could disagree with the store.
 */
function render() {
  dropStaleSelection();
  renderCounts();
  // Cheap, and above the bar-mode return: the title bar is all a bar has, and
  // everything relabelChrome() rewrites was last set by a push that will not
  // come again just because the language changed.
  relabelChrome();
  // Same reason, one tab further in: the add forms' due chips are built once and
  // never rebuilt, so they would keep the old language until the matrix tab
  // happened to redraw.
  // Same again, one screen further out: the first-run card is built once and
  // sits above everything, so its merge line keeps the language and the count
  // it was born with. A no-op while the card is not showing.
  // Cheap, and outside the bar-mode return below: the account block counts the
  // tasks a sign-in would carry up, and that number moves with every change.
  renderAccount();
  // A bar shows nothing but its chips, and renderCounts already did those.
  if (getMode() === "collapsed") return;
  // Everything else on screen draws itself. The guide tab is static markup;
  // the history and trash tabs and the memo panel are React and subscribe to
  // the same signal this render() does -- each of those checks the tab or the
  // selection for itself rather than being dispatched to from here.
  //
  // No ordering dependency on dropStaleSelection above, either: selectedTask()
  // answers null for a task that has just been completed or trashed, so the
  // panel closes on the state rather than on that call having run first.
}

/* --------------------------------------------------------- day rollover */

/**
 * Every due-date label is relative to *today*, but this widget is meant to sit
 * on screen for days. Without a rollover, an item added yesterday keeps its
 * orange "today" chip until some unrelated click happens to re-render.
 */
let dayTimer: ReturnType<typeof setTimeout> | null = null;
let renderedDay = startOfToday().getTime();

/** Redraw only if the date actually moved on. */
function refreshIfDayChanged() {
  const today = startOfToday().getTime();
  if (today === renderedDay) return;
  renderedDay = today;
  render();
}

/** Re-arm for the next local midnight, and keep re-arming after that. */
function scheduleDayRollover() {
  if (dayTimer) clearTimeout(dayTimer);
  // +1s of slack so a timer that fires a hair early doesn't re-render the
  // day that is still ending and then wait another 24h.
  const wait = startOfTomorrow().getTime() - Date.now() + 1000;
  dayTimer = setTimeout(
    () => {
      refreshIfDayChanged();
      scheduleDayRollover();
    },
    Math.max(1000, wait),
  );
}

/* -------------------------------------------------------------- shortcuts */

/**
 * The global keys. They live here rather than in the modules they drive
 * because each one crosses two of them (a tab *and* a focus, a mode *and* a
 * guard), and because one listener is easier to keep consistent than six.
 */
function wireShortcuts() {
  document.addEventListener("keydown", (e) => {
    // Every shortcut here is Ctrl + one key. AltGr reports itself as
    // ctrlKey+altKey on Windows, so without the altKey test a layout that types
    // @ or € through AltGr would fire a shortcut *and* have preventDefault eat
    // the character.
    if (!e.ctrlKey || e.altKey) return;

    if (e.key.toLowerCase() === "m") {
      e.preventDefault();
      toggleSize();
      return;
    }
    if (e.key.toLowerCase() === "e") {
      e.preventDefault();
      // Nothing on screen to export from a bar, and the save dialog would open
      // over a window with no board behind it.
      if (getMode() === "collapsed") return;
      closeSettings();
      exportBoard();
      return;
    }
    if (e.key.toLowerCase() === "d") {
      e.preventDefault();
      toggleTheme();
      return;
    }
    // Ctrl+0 continues the Ctrl+1~4 run: 0 is the "not sorted yet" slot.
    if (e.key === "0") {
      e.preventDefault();
      if (getMode() === "collapsed") return;
      setTab("matrix");
      focusInbox();
      return;
    }
    if (["1", "2", "3", "4"].includes(e.key)) {
      e.preventDefault();
      if (getMode() === "collapsed") return;
      setTab("matrix");
      $(`[data-add="q${e.key}"] input[type="text"]`)?.focus();
    }
  });

  // Waking from sleep or coming back to the window can also cross midnight,
  // and either may happen while the rollover timer is still pending.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshIfDayChanged();
  });
  window.addEventListener("focus", refreshIfDayChanged);
}

/* ------------------------------------------------------------------- init */

/**
 * applyMode, plus the one thing that must not survive a trip into the bar.
 *
 * collapsed.css hides the settings popover, but hiding is not closing:
 * views/settings.js would still believe it is open, and the first gear press
 * in the bar would spend itself closing something nobody can see. It lives
 * here rather than inside applyMode() because chrome.js must not import
 * settings.js -- that direction is already taken.
 */
function enterMode(next: string) {
  if (next === "collapsed") closeSettings();
  applyMode(next);
}

/** Last mode pushed by the main process, which outranks the load snapshot. */
let pushedMode: string | null = null;
/** Same for the update status, for the same reason. */
let pushedUpdate: UpdateStatus | null = null;
/** Same again, for a sync that finished before the load snapshot arrived. */
let pushedTasks: Task[] | null = null;
/** And for its status, which is pushed on the same schedule. */
let pushedSync: SyncStatus | null = null;

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

  // Registered before the first await: the main process sends 'win:mode' from
  // ready-to-show, and a listener attached later would miss it silently.
  window.api.onMode((next) => {
    pushedMode = next;
    enterMode(next);
  });

  // Same race, longer odds: the first update check is seconds away, and the
  // reply below could still be in flight when it lands.
  window.api.onUpdateStatus((next) => {
    pushedUpdate = next;
    applyUpdateStatus(next, { announce: true });
  });

  // Same race as the two above, and the same fix: the first sync runs three
  // seconds after launch and the reply below could still be in flight. Both
  // lists come from main's one array, so the later one is the newer one.
  window.api.onSyncTasks((tasks, offset, overwritten) => {
    setClockOffset(offset);
    pushedTasks = normalizeTasks(tasks);
    acceptSynced(pushedTasks);
    announceOverwritten(overwritten);
  });

  // Carries the session as well as the state. Main can end a session on its
  // own when a token turns out to be revoked, and this is how the guide finds
  // out rather than going on showing an email it no longer has.
  window.api.onSyncStatus((next) => {
    pushedSync = next;
    applySession(next.session ?? null);
    applySyncStatus(next);
  });

  const state = await window.api.load();
  setClockOffset(state.clockOffset);
  setTasks(normalizeTasks(pushedTasks || state.tasks));
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
  wireSettings();
  wireAccount();
  // The session follows the same rule as the mode and the update status: a
  // value that was pushed while load() was in flight is the newer one, and
  // state.auth would otherwise put a signed-out snapshot back on screen.
  applySession(pushedSync ? (pushedSync.session ?? null) : state.auth);
  applySyncStatus(pushedSync || state.sync);

  wireChrome();
  wireInbox();
  mountInbox();
  mountMatrix();
  mountWelcome();
  mountArchive();
  mountMemo();
  wireShortcuts();
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
  applyUpdateStatus(pushedUpdate || state.update);
  // state.mode is a snapshot from before ready-to-show, so a mode that was
  // pushed in the meantime is the newer truth. This is also the first render.
  enterMode(pushedMode || state.mode || "expanded");
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
