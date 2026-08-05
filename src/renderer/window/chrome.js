/**
 * Everything around the lists: the title bar, the 업무/일상 switch, the tabs,
 * the count chips, the theme, and the expanded/bar window modes.
 *
 * These are the pieces of state that decide *what is on screen* rather than
 * what the data is, which is why they live together and away from the store.
 */

import { QUADS, SPACE_LABEL, isCrowded } from "../core-bridge.js";
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
import { exportBoard } from "./export-ui.js";

let mode = "expanded";
let activeTab = "matrix";
let theme = "light";
/** The version already announced, so the toast fires once per download. */
let announced = null;

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
  $$(".space-btn").forEach((btn) => {
    const on = btn.dataset.space === getSpace();
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.title = `${SPACE_LABEL[btn.dataset.space]} 매트릭스 보기`;
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
  labelBtn(
    "#themeBtn",
    theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환",
  );
  if (persist) window.api.setTheme(theme);
}

/** Ctrl+D and the title-bar button both come through here. */
export function toggleTheme() {
  applyTheme(theme === "dark" ? "light" : "dark");
}

/** Reflect the always-on-top state main.js reports back. */
export function applyPinned(on) {
  $("#pinBtn").classList.toggle("on", on);
  labelBtn("#pinBtn", on ? "항상 위 고정 해제" : "항상 위에 고정");
}

/* ----------------------------------------------------------------- update */

/**
 * Reflect what the main process knows about a new version.
 *
 * There is one visible state and it is the last one: a version that has already
 * been downloaded and is waiting for a restart. Checking and downloading stay
 * invisible because they need nothing from the user, and because the update is
 * applied on quit whether or not it was ever noticed — the button and the toast
 * only offer to bring that forward.
 *
 * `announce` splits news from state, and only news is worth interrupting for. A
 * pushed status is news: something finished downloading just now. The one that
 * comes back with state:load is not — it is how things already were, and the
 * renderer asking for it has either just started or just reloaded. The button
 * belongs to both; the toast belongs only to the first.
 */
export function applyUpdateStatus(status, { announce = false } = {}) {
  const ready = status?.state === "ready";
  $("#updateBtn").classList.toggle("hidden", !ready);
  if (!ready) return;

  // Both strings put the version somewhere a Korean particle never follows it:
  // the one that would (…1.0.1'은' / …1.0.2'는') depends on how the last digit
  // is read aloud, and no single wording is right for every release.
  const version = status.version ? ` ${status.version}` : "";
  labelBtn("#updateBtn", `새 버전${version} 준비됨 — 지금 재시작하여 적용`);

  // `announced` is the guard against the same news arriving twice; it is module
  // state and a reload clears it, which is exactly why the reload path above
  // must not announce in the first place.
  if (!announce || announced === status.version) return;
  announced = status.version;
  // No toast in a bar — collapsed.css hides it — but the button is there, and
  // the update lands on the next quit regardless.
  toast(`새 버전을 받았습니다.${version && ` (${status.version})`}`, {
    ms: 10000,
    action: { label: "지금 재시작", onClick: () => window.api.installUpdate() },
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
  labelBtn("#sizeBtn", mode === "collapsed" ? "펼치기" : "바 모드로 축소");
  notify();
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
    const btn = e.target.closest(".space-btn");
    if (!btn || btn.dataset.space === getSpace()) return;
    applySpace(btn.dataset.space);
    notify();
  });

  $("#themeBtn").addEventListener("click", toggleTheme);
  $("#exportBtn").addEventListener("click", exportBoard);
  $("#updateBtn").addEventListener("click", () => window.api.installUpdate());

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
