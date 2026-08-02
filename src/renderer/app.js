import {
  DEFAULT_LAYOUT,
  MIN_RATIO,
  QUADS,
  SPACE_LABEL,
  normalizeTasks,
  sanitizeLayout,
  startOfToday,
  startOfTomorrow,
} from './core-bridge.js';
import {
  activeOf,
  doneTasks,
  getSpace,
  inboxTasks,
  moveTask,
  setSpace,
  setTasks,
  trashedTasks,
} from './store.js';
import { subscribe } from './render-bus.js';
import { $, $$, labelBtn } from './dom.js';
import { toast } from './components/toast.js';
import { renderMatrix, wireAddForms } from './views/matrix.js';
import {
  applyInboxOpen,
  focusInbox,
  renderInbox,
  wireInbox,
} from './views/inbox.js';
import { renderHistory, renderTrash, wireArchive } from './views/archive.js';
import {
  clearSelectionSilently,
  dropStaleSelection,
  renderMemo,
  setSelected,
  wireMemo,
} from './views/memo.js';

let mode = "expanded";
let activeTab = "matrix";
let theme = "light";

/* --------------------------------------------------------- day rollover */

/**
 * Every due-date label is relative to *today*, but this widget is meant to sit
 * on screen for days. Without a rollover, an item added yesterday keeps its
 * orange "오늘" chip until some unrelated click happens to re-render.
 */
let dayTimer = null;
let renderedDay = startOfToday().getTime();

function refreshIfDayChanged() {
  const today = startOfToday().getTime();
  if (today === renderedDay) return;
  renderedDay = today;
  render();
}

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

/* -------------------------------------------------------------- rendering */

function renderCounts() {
  QUADS.forEach((q, i) => {
    $(`#c${i + 1}`).textContent = String(activeOf(q).length);
  });
  // The bar chip stays out of the way until there is something unclassified, so
  // seeing it at all is the signal.
  const waiting = inboxTasks().length;
  $("#cInbox").textContent = String(waiting);
  $("#inboxChip").classList.toggle("hidden", waiting === 0);
  $("#doneCount").textContent = String(doneTasks().length);
  $("#trashCount").textContent = String(trashedTasks().length);
}

/* -------------------------------------------------------------- rendering */

function render() {
  dropStaleSelection();
  renderCounts();
  if (mode === "collapsed") return;
  if (activeTab === "matrix") {
    renderInbox();
    renderMatrix();
  } else if (activeTab === "history") renderHistory();
  else if (activeTab === "trash") renderTrash();
  // the guide tab is static markup — nothing to render
  renderMemo();
}

/* ----------------------------------------------------------------- boards */

/**
 * 업무 / 일상. Both matrices live in the same task list — a board is just the
 * `space` field — so switching is a filter and a re-render, never a load. The
 * inbox is left out of the filter on purpose (see `inSpace`).
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

function applySpace(next, persist = true) {
  const space = setSpace(next);
  syncSpaceSwitch();
  if (persist) window.api.setSpace(space);
}

/* ------------------------------------------------------------------- tabs */

function setTab(tab) {
  // The panel belongs to the matrix; leaving the tab closes it (and gives the
  // window its height back) rather than leaving it pointing at a hidden row.
  if (tab !== "matrix") setSelected(null);
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
  render();
}

/* ---------------------------------------------------------------- export */

/**
 * The inbox and the four quadrants, written out as PDF, HTML or Markdown. The
 * format comes from the extension picked in the native save dialog, and the
 * document itself is built in the main process from the same task list that was
 * last saved — so there is nothing to collect here beyond the click.
 */
async function exportBoard() {
  const btn = $("#exportBtn");
  if (btn.disabled) return;
  btn.disabled = true;
  try {
    const res = await window.api.exportBoard();
    if (res?.ok) {
      toast(`저장했습니다 · ${res.name}`, {
        action: {
          label: "폴더 열기",
          onClick: () => window.api.revealExport(res.path),
        },
      });
    } else if (res?.reason === "empty") {
      toast("내보낼 항목이 없습니다.");
    } else if (res?.reason === "error") {
      toast(`저장하지 못했습니다: ${res.message}`, { error: true, ms: 6000 });
    }
    // 'canceled' is the user closing the dialog — no message for that.
  } finally {
    btn.disabled = false;
  }
}

/* ------------------------------------------------------------ drag & drop */

function afterElement(list, y) {
  const items = $$(".item:not(.dragging)", list);
  return items.find((el) => {
    const box = el.getBoundingClientRect();
    return y < box.top + box.height / 2;
  });
}

/** Every place a task can be dropped: the four quadrants plus the inbox. */
const dropZones = () => [...$$(".quad"), $("#inboxPanel")];

function wireDragAndDrop() {
  let draggingId = null;

  document.addEventListener("dragstart", (e) => {
    const item = e.target.closest?.(".item");
    if (!item) return;
    draggingId = item.dataset.id;
    item.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", draggingId);
  });

  document.addEventListener("dragend", (e) => {
    e.target.closest?.(".item")?.classList.remove("dragging");
    dropZones().forEach((z) => z.classList.remove("drop"));
    draggingId = null;
  });

  dropZones().forEach((zone) => {
    // The inbox zone is the whole section, header included, so a task can be
    // sent back up while the list is folded. afterElement then measures hidden
    // rows as zero-height and finds no insertion point, which lands the task at
    // the end — the right answer for a drop on a collapsed header.
    const list = $(".list, .inbox-list", zone);

    zone.addEventListener("dragover", (e) => {
      if (!draggingId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      zone.classList.add("drop");
    });

    zone.addEventListener("dragleave", (e) => {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove("drop");
    });

    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("drop");
      const id = draggingId || e.dataTransfer.getData("text/plain");
      if (!id) return;
      const before = afterElement(list, e.clientY);
      moveTask(id, zone.dataset.quad, before ? before.dataset.id : null);
    });
  });
}

/* ----------------------------------------------------------- quad sizing */

/**
 * Two ratios drive the whole 2×2 grid: `cols` is q1/q3's share of the width,
 * `rows` is q1/q2's share of the height. Because the tracks are shared, wider
 * q1 means narrower q2, and taller q1 means shorter q3 *and* q4 — which is
 * what makes it read as one matrix instead of four independent boxes.
 */
/** Read from CSS instead of duplicating it — the grid gap is the source. */
const GUTTER =
  Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--gutter"),
  ) || 10;
/** How far past the gutter the grab zone reaches into each quadrant. */
const EDGE_REACH = 4;
const HIT = GUTTER / 2 + EDGE_REACH;

/** Smallest a quadrant may be dragged to, where the window can afford it. */
const MIN_COL_PX = 180;
const MIN_ROW_PX = 110;

let layout = { ...DEFAULT_LAYOUT };
let layoutTimer = null;

/**
 * Clamp to a pixel minimum while the window is big enough to honour it, and
 * to the plain ratio floor once it is not.
 */
function clampAxis(value, span, minPx) {
  if (!Number.isFinite(value)) return 0.5;
  const floor = span > 0 ? Math.min(minPx / span, 0.5) : MIN_RATIO;
  const low = Math.max(MIN_RATIO, floor);
  return Math.min(1 - low, Math.max(low, value));
}

/**
 * Ratios become grid tracks. The px floor in each minmax() keeps a quadrant
 * usable when the window itself gets small enough to beat the drag clamp.
 */
function applyLayout() {
  const track = (ratio, minPx) =>
    `minmax(${minPx}px, ${(ratio * 100).toFixed(3)}fr) ` +
    `minmax(${minPx}px, ${((1 - ratio) * 100).toFixed(3)}fr)`;

  const grid = $("#matrixView");
  grid.style.gridTemplateColumns = track(layout.cols, MIN_COL_PX);
  grid.style.gridTemplateRows = track(layout.rows, MIN_ROW_PX);
}

function saveLayout() {
  clearTimeout(layoutTimer);
  layoutTimer = setTimeout(() => window.api.setLayout(layout), 150);
}

/**
 * Content box of the grid plus the centre line of each divider, read straight
 * off the corner quadrants so no padding math is needed.
 */
function metrics() {
  const a = $('[data-quad="q1"]').getBoundingClientRect();
  const d = $('[data-quad="q4"]').getBoundingClientRect();
  return {
    left: a.left,
    top: a.top,
    width: d.right - a.left,
    height: d.bottom - a.top,
    x: (a.right + d.left) / 2,
    y: (a.bottom + d.top) / 2,
  };
}

/** Which divider the point is on: "col", "row", "both", or null. */
function edgeAt(x, y) {
  const m = metrics();
  if (m.width <= 0 || m.height <= 0) return null;
  if (x < m.left || x > m.left + m.width) return null;
  if (y < m.top || y > m.top + m.height) return null;

  const col = Math.abs(x - m.x) <= HIT;
  const row = Math.abs(y - m.y) <= HIT;
  if (col && row) return "both";
  if (col) return "col";
  if (row) return "row";
  return null;
}

/** Cursor on the grid, accent border on the two quadrants sharing the edge. */
function markEdge(mode) {
  const grid = $("#matrixView");
  grid.classList.toggle("edge-col", mode === "col");
  grid.classList.toggle("edge-row", mode === "row");
  grid.classList.toggle("edge-both", mode === "both");

  const col = mode === "col" || mode === "both";
  const row = mode === "row" || mode === "both";
  QUADS.forEach((q) => {
    const el = $(`[data-quad="${q}"]`);
    el.classList.toggle("edge-r", col && (q === "q1" || q === "q3"));
    el.classList.toggle("edge-l", col && (q === "q2" || q === "q4"));
    el.classList.toggle("edge-b", row && (q === "q1" || q === "q2"));
  });
}

function wireQuadEdges() {
  const grid = $("#matrixView");
  let dragging = null;

  /** Pointer position → the ratios for whichever axes are being dragged. */
  const ratiosAt = (ev) => {
    const m = metrics();
    const next = {};
    if (dragging !== "row") {
      const span = m.width - GUTTER;
      const raw = (ev.clientX - m.left - GUTTER / 2) / span;
      if (span > 0) next.cols = clampAxis(raw, span, MIN_COL_PX);
    }
    if (dragging !== "col") {
      const span = m.height - GUTTER;
      const raw = (ev.clientY - m.top - GUTTER / 2) / span;
      if (span > 0) next.rows = clampAxis(raw, span, MIN_ROW_PX);
    }
    return next;
  };

  grid.addEventListener("pointermove", (e) => {
    if (!dragging) markEdge(edgeAt(e.clientX, e.clientY));
  });

  grid.addEventListener("pointerleave", () => {
    if (!dragging) markEdge(null);
  });

  grid.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !e.isPrimary) return;
    const mode = edgeAt(e.clientX, e.clientY);
    if (!mode) return;

    e.preventDefault();
    dragging = mode;
    markEdge(mode);
    grid.setPointerCapture(e.pointerId);
    document.body.classList.add(`resizing-${mode}`);

    const onMove = (ev) => {
      Object.assign(layout, ratiosAt(ev));
      applyLayout();
      saveLayout();
    };
    // lostpointercapture is the backstop: however the drag ends — button
    // released off-window, capture stolen — the listeners come off.
    const onUp = (ev) => {
      dragging = null;
      document.body.classList.remove(
        "resizing-col",
        "resizing-row",
        "resizing-both",
      );
      markEdge(ev ? edgeAt(ev.clientX, ev.clientY) : null);
      grid.removeEventListener("pointermove", onMove);
      grid.removeEventListener("pointerup", onUp);
      grid.removeEventListener("pointercancel", onUp);
      grid.removeEventListener("lostpointercapture", onUp);
    };

    grid.addEventListener("pointermove", onMove);
    grid.addEventListener("pointerup", onUp);
    grid.addEventListener("pointercancel", onUp);
    grid.addEventListener("lostpointercapture", onUp);
  });

  // Double-clicking an edge re-centres it; the crossing re-centres both.
  grid.addEventListener("dblclick", (e) => {
    const mode = edgeAt(e.clientX, e.clientY);
    if (!mode) return;
    if (mode !== "row") layout.cols = DEFAULT_LAYOUT.cols;
    if (mode !== "col") layout.rows = DEFAULT_LAYOUT.rows;
    applyLayout();
    saveLayout();
  });
}

/* ------------------------------------------------------------------ theme */

function applyTheme(next, persist = true) {
  theme = next === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  labelBtn(
    "#themeBtn",
    theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환",
  );
  if (persist) window.api.setTheme(theme);
}

function applyPinned(on) {
  $("#pinBtn").classList.toggle("on", on);
  labelBtn("#pinBtn", on ? "항상 위 고정 해제" : "항상 위에 고정");
}

/* -------------------------------------------------------- window controls */

/** Last mode pushed by the main process, which outranks the load snapshot. */
let pushedMode = null;

function applyMode(next) {
  mode = next;
  // collapse() already dropped the panel's height on its way to the bar, so
  // clear the selection here without asking for another resize.
  if (mode === "collapsed") clearSelectionSilently();
  document.body.classList.toggle("collapsed", mode === "collapsed");
  document.body.classList.toggle("expanded", mode === "expanded");
  labelBtn("#sizeBtn", mode === "collapsed" ? "펼치기" : "바 모드로 축소");
  render();
}

function toggleSize() {
  if (mode === "collapsed") window.api.expand();
  else window.api.collapse();
}

/* ------------------------------------------------------------------- init */

function wireUI() {
  $$(".tab").forEach((btn) =>
    btn.addEventListener("click", () => setTab(btn.dataset.tab)),
  );

  $("#spaceSwitch").addEventListener("click", (e) => {
    const btn = e.target.closest(".space-btn");
    if (!btn || btn.dataset.space === getSpace()) return;
    applySpace(btn.dataset.space);
    render();
  });

  $("#themeBtn").addEventListener("click", () =>
    applyTheme(theme === "dark" ? "light" : "dark"),
  );

  $("#exportBtn").addEventListener("click", exportBoard);

  $("#sizeBtn").addEventListener("click", toggleSize);
  $("#minBtn").addEventListener("click", () => window.api.minimize());
  $("#closeBtn").addEventListener("click", () => window.api.close());

  $("#pinBtn").addEventListener("click", async () => {
    applyPinned(await window.api.togglePin());
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

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === "m") {
      e.preventDefault();
      toggleSize();
      return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === "e") {
      e.preventDefault();
      // Bar mode hides the button; keep the shortcut in step with it.
      if (mode === "collapsed") return;
      exportBoard();
      return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === "d") {
      e.preventDefault();
      applyTheme(theme === "dark" ? "light" : "dark");
      return;
    }
    // Ctrl+0 continues the Ctrl+1~4 run: 0 is the "not sorted yet" slot.
    if (e.ctrlKey && e.key === "0") {
      e.preventDefault();
      if (mode === "collapsed") return;
      setTab("matrix");
      focusInbox();
      return;
    }
    if (e.ctrlKey && ["1", "2", "3", "4"].includes(e.key)) {
      e.preventDefault();
      if (mode === "collapsed") return;
      setTab("matrix");
      $(`[data-add="q${e.key}"] input[type="text"]`)?.focus();
    }
  });

  wireAddForms();
  wireInbox();
  wireArchive();
  wireMemo();

  // Waking from sleep or coming back to the window can also cross midnight,
  // and either may happen while the rollover timer is still pending.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshIfDayChanged();
  });
  window.addEventListener("focus", refreshIfDayChanged);
}

async function init() {
  // Registered before the first await: the main process sends 'win:mode' from
  // ready-to-show, and a listener attached later would miss it silently.
  window.api.onMode((next) => {
    pushedMode = next;
    applyMode(next);
  });

  const state = await window.api.load();
  setTasks(normalizeTasks(state.tasks));
  // Everything that changes a task ends in store.commit(), so one subscription
  // here is what keeps the screen in step with the data.
  subscribe(render);
  applyTheme(state.settings?.theme || "light", false);
  applyPinned(state.settings?.alwaysOnTop !== false);
  applyInboxOpen(state.settings?.inboxOpen === true, false);
  applySpace(state.settings?.activeSpace, false);
  layout = sanitizeLayout(state.settings?.layout);
  applyLayout();
  wireUI();
  wireDragAndDrop();
  wireQuadEdges();
  // state.mode is a snapshot from before ready-to-show, so a mode that was
  // pushed in the meantime is the newer truth.
  applyMode(pushedMode || state.mode || "expanded");
  scheduleDayRollover();
}

init();
