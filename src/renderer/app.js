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

import { normalizeTasks, startOfToday, startOfTomorrow } from './core-bridge.js';
import { setTasks } from './store.js';
import { subscribe } from './render-bus.js';
import { $ } from './dom.js';
import { renderMatrix, wireAddForms } from './views/matrix.js';
import {
  applyInboxOpen,
  focusInbox,
  renderInbox,
  wireInbox,
} from './views/inbox.js';
import { renderHistory, renderTrash, wireArchive } from './views/archive.js';
import { dropStaleSelection, renderMemo, wireMemo } from './views/memo.js';
import {
  applyMode,
  applyPinned,
  applySpace,
  applyTheme,
  getMode,
  getTab,
  renderCounts,
  setTab,
  toggleSize,
  toggleTheme,
  wireChrome,
} from './window/chrome.js';
import { setLayout, wireQuadEdges } from './window/layout.js';
import { wireDragAndDrop } from './window/dnd.js';
import { exportBoard } from './window/export-ui.js';

/* -------------------------------------------------------------- rendering */

/**
 * The one redraw. Everything that changes anything ends up here through the
 * render bus, and it always rebuilds the whole visible tab — there is no
 * partial update that could disagree with the store.
 */
function render() {
  dropStaleSelection();
  renderCounts();
  // A bar shows nothing but its chips, and renderCounts already did those.
  if (getMode() === 'collapsed') return;
  const tab = getTab();
  if (tab === 'matrix') {
    renderInbox();
    renderMatrix();
  } else if (tab === 'history') renderHistory();
  else if (tab === 'trash') renderTrash();
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
  dayTimer = setTimeout(() => {
    refreshIfDayChanged();
    scheduleDayRollover();
  }, Math.max(1000, wait));
}

/* -------------------------------------------------------------- shortcuts */

/**
 * The global keys. They live here rather than in the modules they drive
 * because each one crosses two of them (a tab *and* a focus, a mode *and* a
 * guard), and because one listener is easier to keep consistent than six.
 */
function wireShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      toggleSize();
      return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      // Bar mode hides the button; keep the shortcut in step with it.
      if (getMode() === 'collapsed') return;
      exportBoard();
      return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      toggleTheme();
      return;
    }
    // Ctrl+0 continues the Ctrl+1~4 run: 0 is the "not sorted yet" slot.
    if (e.ctrlKey && e.key === '0') {
      e.preventDefault();
      if (getMode() === 'collapsed') return;
      setTab('matrix');
      focusInbox();
      return;
    }
    if (e.ctrlKey && ['1', '2', '3', '4'].includes(e.key)) {
      e.preventDefault();
      if (getMode() === 'collapsed') return;
      setTab('matrix');
      $(`[data-add="q${e.key}"] input[type="text"]`)?.focus();
    }
  });

  // Waking from sleep or coming back to the window can also cross midnight,
  // and either may happen while the rollover timer is still pending.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshIfDayChanged();
  });
  window.addEventListener('focus', refreshIfDayChanged);
}

/* ------------------------------------------------------------------- init */

/** Last mode pushed by the main process, which outranks the load snapshot. */
let pushedMode = null;

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

  const state = await window.api.load();
  setTasks(normalizeTasks(state.tasks));
  // Every change ends on the render bus, so this one subscription is what keeps
  // the screen in step with the data.
  subscribe(render);

  applyTheme(state.settings?.theme || 'light', false);
  applyPinned(state.settings?.alwaysOnTop !== false);
  applyInboxOpen(state.settings?.inboxOpen === true, false);
  applySpace(state.settings?.activeSpace, false);
  setLayout(state.settings?.layout);

  wireChrome();
  wireAddForms();
  wireInbox();
  wireArchive();
  wireMemo();
  wireShortcuts();
  wireDragAndDrop();
  wireQuadEdges();

  // state.mode is a snapshot from before ready-to-show, so a mode that was
  // pushed in the meantime is the newer truth. This is also the first render.
  applyMode(pushedMode || state.mode || 'expanded');
  scheduleDayRollover();
}

init();
