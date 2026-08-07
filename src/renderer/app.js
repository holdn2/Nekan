/**
 * Renderer entry point: assemble the modules, draw the first frame, and hold
 * the two things that belong to no single view — the render dispatcher and the
 * keyboard shortcuts.
 *
 * The dependency graph runs one way and ends here:
 *
 *   core-bridge ─→ store ─→ views/* ─┐
 *          └─────→ dom  ─→ components/*  ├─→ app.js
 *                       render-bus ──────┘
 *
 * Nothing imports this file, which is what lets every other module be read on
 * its own.
 */

import {
  normalizeTasks,
  startOfToday,
  startOfTomorrow,
} from "./core-bridge.js";
import { acceptSynced, setClockOffset, setTasks } from "./store.js";
import { subscribe } from "./render-bus.js";
import { $ } from "./dom.js";
import { toast } from "./components/toast.js";
import { renderMatrix, wireAddForms } from "./views/matrix.js";
import {
  applyInboxOpen,
  focusInbox,
  renderInbox,
  wireInbox,
} from "./views/inbox.js";
import { renderHistory, renderTrash, wireArchive } from "./views/archive.js";
import {
  announceOverwritten,
  applySession,
  applySyncStatus,
  renderAccount,
  setDevLogin,
  wireAccount,
} from "./views/account.js";
import { dropStaleSelection, renderMemo, wireMemo } from "./views/memo.js";
import {
  applyMode,
  applyPinned,
  applySpace,
  applyTheme,
  applyUpdateStatus,
  applyVersion,
  getMode,
  getTab,
  renderCounts,
  setTab,
  toggleSize,
  toggleTheme,
  wireChrome,
} from "./window/chrome.js";
import { setLayout, wireQuadEdges } from "./window/layout.js";
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
  // Cheap, and outside the bar-mode return below: the account block counts the
  // tasks a sign-in would carry up, and that number moves with every change.
  renderAccount();
  // A bar shows nothing but its chips, and renderCounts already did those.
  if (getMode() === "collapsed") return;
  const tab = getTab();
  if (tab === "matrix") {
    renderInbox();
    renderMatrix();
  } else if (tab === "history") renderHistory();
  else if (tab === "trash") renderTrash();
  // the guide tab is static markup — nothing to render
  renderMemo();
}

/* --------------------------------------------------------- day rollover */

/**
 * Every due-date label is relative to *today*, but this widget is meant to sit
 * on screen for days. Without a rollover, an item added yesterday keeps its
 * orange "오늘" chip until some unrelated click happens to re-render.
 */
let dayTimer = null;
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
  clearTimeout(dayTimer);
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
      // Bar mode hides the button; keep the shortcut in step with it.
      if (getMode() === "collapsed") return;
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

/** Last mode pushed by the main process, which outranks the load snapshot. */
let pushedMode = null;
/** Same for the update status, for the same reason. */
let pushedUpdate = null;
/** Same again, for a sync that finished before the load snapshot arrived. */
let pushedTasks = null;
/** And for its status, which is pushed on the same schedule. */
let pushedSync = null;

/**
 * Load, wire, draw. The order is what matters here: the mode listener before
 * the first await, the store before anything reads it, and the wiring before
 * the render that applyMode() triggers at the end.
 */
async function init() {
  // Registered before the first await: the main process sends 'win:mode' from
  // ready-to-show, and a listener attached later would miss it silently.
  window.api.onMode((next) => {
    pushedMode = next;
    applyMode(next);
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
    applySession(next.session);
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
  wireAccount(() => setTab("guide"));
  // The session follows the same rule as the mode and the update status: a
  // value that was pushed while load() was in flight is the newer one, and
  // state.auth would otherwise put a signed-out snapshot back on screen.
  applySession(pushedSync ? pushedSync.session : state.auth);
  applySyncStatus(pushedSync || state.sync);

  wireChrome();
  wireAddForms();
  wireInbox();
  wireArchive();
  wireMemo();
  wireShortcuts();
  wireDragAndDrop();
  wireQuadEdges();

  // No announce: this is the state as it already stood, and a reload arrives
  // here too. Whatever landed as a push above has announced itself already.
  applyUpdateStatus(pushedUpdate || state.update);
  // state.mode is a snapshot from before ready-to-show, so a mode that was
  // pushed in the meantime is the newer truth. This is also the first render.
  applyMode(pushedMode || state.mode || "expanded");
  scheduleDayRollover();
}

// A rejected state:load would otherwise skip every step after it and leave the
// window showing unwired static markup, with nothing but an unhandled rejection
// in a devtools console the user does not have open.
init().catch((err) => {
  console.error("renderer init failed", err);
  toast("시작하지 못했습니다. 앱을 다시 실행해 주세요.", {
    error: true,
    ms: 20000,
  });
});
