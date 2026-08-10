/**
 * Everything around the lists: the title bar, the Work/Life switch, the tabs,
 * the count chips, the theme, and the expanded/bar window modes.
 *
 * These are the pieces of state that decide *what is on screen* rather than
 * what the data is, which is why they live together and away from the store.
 *
 * Most of what this file writes arrives as a push from the main process and is
 * never asked for again — the pin state, the window mode, the update status.
 * That makes it the exact shape of thing a language switch leaves behind in the
 * old language, so each one is remembered here and `relabelChrome()` puts it
 * back. See the same trap in views/account.js, where the sync line hit it first.
 */

import { QUADS, isCrowded } from "../core-bridge.js";
import { t } from "../i18n.js";
import { $, $$, labelBtn } from "../dom.js";
import { notify } from "../render-bus.js";
import { toast } from "../components/toast.js";
import {
  activeOf,
  doneTasks,
  getSpace,
  inboxTasks,
  setSpace,
  trashedTasks,
} from "../store.js";
import { resetArchivePaging } from "../views/archive.js";
import { applyInboxOpen } from "../views/inbox.js";
import { clearSelectionSilently, setSelected } from "../views/memo.js";

let mode = "expanded";
let activeTab = "matrix";
let theme = "light";
/** The version already announced, so the toast fires once per download. */
let announced = null;
/** Last values pushed in, kept so relabelChrome() can rewrite them. */
let pinned = true;
let updateStatus = null;

/** 'expanded' | 'collapsed'. The render dispatcher skips the lists in a bar. */
export const getMode = () => mode;
/** 'matrix' | 'history' | 'trash' | 'guide'. */
export const getTab = () => activeTab;

/* ----------------------------------------------------------------- counts */

/**
 * The five chips in the title bar and the two tab badges. They are the only
 * thing that still updates in bar mode, which is the point of the bar.
 */
export function renderCounts() {
  QUADS.forEach((q, i) => {
    const count = activeOf(q).length;
    $(`#c${i + 1}`).textContent = String(count);
    // The bar is the mode this widget is left in, so the hint has to survive
    // into it — the chip is all that is on screen there.
    $(`#c${i + 1}`)
      .closest(".chip")
      .classList.toggle("crowded", isCrowded(q, count));
  });
  // The bar chip stays out of the way until there is something unclassified, so
  // seeing it at all is the signal.
  const waiting = inboxTasks().length;
  $("#cInbox").textContent = String(waiting);
  $("#inboxChip").classList.toggle("hidden", waiting === 0);
  $("#doneCount").textContent = String(doneTasks().length);
  $("#trashCount").textContent = String(trashedTasks().length);
}

/* ----------------------------------------------------------------- boards */

/**
 * 업무 / 일상. Both matrices live in the same task list — a board is just the
 * `space` field — so switching is a filter and a re-render, never a load. The
 * inbox is left out of the filter on purpose (see store.inSpace).
 *
 * Both halves are on screen in either window mode, so a click always means
 * "show me this one" and never "flip to the other".
 */
function syncSpaceSwitch() {
  $$("#spaceSwitch .switch-btn").forEach((btn) => {
    const on = btn.dataset.space === getSpace();
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.title = t("space.view", { space: t(`space.${btn.dataset.space}`) });
  });
}

/** Switch boards. `persist` is false while replaying the saved choice. */
export function applySpace(next, persist = true) {
  const space = setSpace(next);
  syncSpaceSwitch();
  if (persist) window.api.setSpace(space);
}

/* ------------------------------------------------------------------- tabs */

/** Show one view and hide the rest, then redraw whatever it needs. */
export function setTab(tab) {
  // The panel belongs to the matrix; leaving the tab closes it (and gives the
  // window its height back) rather than leaving it pointing at a hidden row.
  if (tab !== "matrix") setSelected(null);
  // A list someone expanded with 더 보기 goes back to one page. Leaving it open
  // makes every later redraw pay for a choice made once and forgotten.
  resetArchivePaging();
  activeTab = tab;
  $$(".tab").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.tab === tab),
  );
  // The inbox belongs to the matrix, so it travels with it rather than sitting
  // above the history or trash lists.
  $("#inboxPanel").classList.toggle("hidden", tab !== "matrix");
  $("#matrixView").classList.toggle("hidden", tab !== "matrix");
  $("#historyView").classList.toggle("hidden", tab !== "history");
  $("#trashView").classList.toggle("hidden", tab !== "trash");
  $("#guideView").classList.toggle("hidden", tab !== "guide");
  notify();
}

/* ------------------------------------------------------------ theme / pin */

/** Swap the palette. The stylesheet keys off data-theme on <html>. */
export function applyTheme(next, persist = true) {
  theme = next === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  // The control moved into the settings panel, but reflecting it stays here:
  // views/settings.js already imports this file, and importing back would
  // close a cycle the renderer graph does not have anywhere else.
  $$("#themeSeg .switch-btn").forEach((btn) => {
    const on = btn.dataset.theme === theme;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", String(on));
  });
  if (persist) window.api.setTheme(theme);
}

/** Ctrl+D and the settings panel both come through here. */
export function toggleTheme() {
  applyTheme(theme === "dark" ? "light" : "dark");
}

/** Reflect the always-on-top state main.js reports back. */
export function applyPinned(on) {
  pinned = on;
  $("#pinBtn").classList.toggle("on", on);
  labelBtn("#pinBtn", t(on ? "titlebar.unpin" : "titlebar.pin"));
}

/* ----------------------------------------------------------------- update */

/**
 * Show the running version. It cannot change while the app is open.
 *
 * Twice: quietly beside the name where it can be read at a glance, and in the
 * guide next to the update state. The title bar one is hidden in bar mode along
 * with the name, so it costs the bar no width at all.
 */
export function applyVersion(version) {
  $("#appVersion").textContent = version || "—";
  $("#titleVersion").textContent = version || "";
}

/**
 * What the guide tab says about updates, in the caller's own words.
 *
 * `idle` says nothing at all. It is where a *failed* check lands as well as a
 * run that has not checked yet, and there is no sentence that is true of both
 * without explaining more than anyone asked. Silence is the honest option; the
 * version above it is still there.
 */
const UPDATE_TEXT = {
  checking: "update.checking",
  latest: "update.latest",
  downloading: "update.downloading",
  ready: "update.ready",
};

/**
 * Reflect what the main process knows about a new version.
 *
 * The title bar still shows exactly one state: a version already downloaded and
 * waiting for a restart. Checking and downloading stay out of it because they
 * need nothing from the user, and a button offering a restart that cannot
 * happen yet is a dead button.
 *
 * The guide tab is not held to that. It is a tab someone opened to read about
 * the app, nothing there is clickable-but-useless, and "checking" or "this is
 * the latest version" are answers to the question that brought them.
 *
 * `announce` splits news from state, and only news is worth interrupting for. A
 * pushed status is news: something finished downloading just now. The one that
 * comes back with state:load is not — it is how things already were, and the
 * renderer asking for it has either just started or just reloaded. The button
 * belongs to both; the toast belongs only to the first.
 */
export function applyUpdateStatus(status, { announce = false } = {}) {
  updateStatus = status;
  const ready = status?.state === "ready";
  $("#updateBtn").classList.toggle("hidden", !ready);

  // Both strings put the version somewhere a Korean particle never follows it:
  // the one that would (…1.0.1'은' / …1.0.2'는') depends on how the last digit
  // is read aloud, and no single wording is right for every release. The space
  // travels with the number so the sentence closes up when there is none.
  const version = status?.version ? ` ${status.version}` : "";

  const key = UPDATE_TEXT[status?.state];
  $("#updateState").textContent = key ? t(key, { version }) : "";

  if (!ready) return;

  labelBtn("#updateBtn", t("update.button", { version }));

  // `announced` is the guard against the same news arriving twice; it is module
  // state and a reload clears it, which is exactly why the reload path above
  // must not announce in the first place.
  if (!announce || announced === status.version) return;
  announced = status.version;
  // No toast in a bar — collapsed.css hides it — but the button is there, and
  // the update lands on the next quit regardless.
  toast(t("update.toast", { version: version && ` (${status.version})` }), {
    ms: 10000,
    action: {
      label: t("update.restart"),
      onClick: () => window.api.installUpdate(),
    },
  });
}

/* -------------------------------------------------------- window controls */

/**
 * Follow the main process into or out of bar mode. Only main.js decides the
 * mode — this repaints for whatever it decided.
 */
export function applyMode(next) {
  mode = next;
  // collapse() already dropped the panel's height on its way to the bar, so
  // clear the selection here without asking for another resize.
  if (mode === "collapsed") clearSelectionSilently();
  document.body.classList.toggle("collapsed", mode === "collapsed");
  document.body.classList.toggle("expanded", mode === "expanded");
  labelBtn(
    "#sizeBtn",
    t(mode === "collapsed" ? "titlebar.expand" : "titlebar.collapse"),
  );
  notify();
}

/**
 * Rewrite everything in the title bar that no redraw would reach on its own.
 *
 * Called from the render dispatcher, which is what a language switch ends on.
 * Every one of these was last written by a push — a pin toggle, a mode change,
 * an update that finished downloading — and none of them will be pushed again
 * just because the language changed. It sits before the bar-mode return in
 * render() on purpose: three of the four are visible in a bar.
 */
export function relabelChrome() {
  syncSpaceSwitch();
  applyPinned(pinned);
  labelBtn(
    "#sizeBtn",
    t(mode === "collapsed" ? "titlebar.expand" : "titlebar.collapse"),
  );
  // No announce: this is the state as it already stood, and the toast for it
  // has either fired or belongs to a version this run has not seen.
  applyUpdateStatus(updateStatus);
}

/** Ctrl+M, the size button and a double-click on the bar all land here. */
export function toggleSize() {
  if (mode === "collapsed") window.api.expand();
  else window.api.collapse();
}

/* ----------------------------------------------------------------- wiring */

/** Bind the title bar and the tab strip. Called once at startup. */
export function wireChrome() {
  $$(".tab").forEach((btn) =>
    btn.addEventListener("click", () => setTab(btn.dataset.tab)),
  );

  $("#spaceSwitch").addEventListener("click", (e) => {
    const btn = e.target.closest(".switch-btn");
    if (!btn || btn.dataset.space === getSpace()) return;
    applySpace(btn.dataset.space);
    notify();
  });

  $("#updateBtn").addEventListener("click", () => window.api.installUpdate());
  // Opens in the real browser. Loading GitHub into this window would put a web
  // page where the widget was, with no way back — there is no chrome to it.
  $("#releaseNotes").addEventListener("click", () =>
    window.api.openReleaseNotes(),
  );
  $("#guidePrivacy").addEventListener("click", () =>
    window.api.openPrivacyPolicy(),
  );

  $("#sizeBtn").addEventListener("click", toggleSize);
  $("#minBtn").addEventListener("click", () => window.api.minimize());
  $("#closeBtn").addEventListener("click", () => window.api.close());

  $("#pinBtn").addEventListener("click", async () => {
    // main is the authority on the pin state, so the button only ever reflects
    // what it answers. If the call fails there is nothing new to reflect —
    // leave the label alone rather than showing a state we did not reach.
    try {
      applyPinned(await window.api.togglePin());
    } catch (err) {
      console.error("togglePin failed", err);
    }
  });

  $("#barSummary").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip || mode !== "collapsed") return;
    window.api.expand();
    setTab("matrix");
    // The inbox chip is only there when something is waiting in it, so clicking
    // it means "show me those" — unfold on the way out of bar mode. No focus
    // here: the window is still resizing and would swallow it.
    if (chip.dataset.jump === "inbox") applyInboxOpen(true);
  });

  $(".titlebar").addEventListener("dblclick", (e) => {
    if (e.target.closest("button")) return;
    toggleSize();
  });
}
