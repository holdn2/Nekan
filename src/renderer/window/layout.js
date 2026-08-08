/**
 * Dragging the lines between the quadrants.
 *
 * The grid has exactly two degrees of freedom — `cols` (q1/q3's share of the
 * width) and `rows` (q1/q2's share of the height) — and the tracks are shared,
 * so widening q1 narrows q2 and heightening q1 shortens q3 *and* q4. That is
 * what makes it read as one matrix rather than four boxes that happen to sit
 * next to each other.
 *
 * There is no splitter element to grab: the gutter is CSS grid gap and the
 * pointer is tested against the centre lines measured off the corner quadrants.
 * Real dividers would be four more elements the drop zones would have to ignore.
 */

import {
  DEFAULT_LAYOUT,
  MIN_COL_PX,
  MIN_ROW_PX,
  QUADS,
  clampAxis,
  sanitizeLayout,
} from "../core-bridge.js";
import { $ } from "../dom.js";

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

let layout = { ...DEFAULT_LAYOUT };
let layoutTimer = null;
/** The grid's own padding, measured once — applyLayout runs on every drag move. */
let gridPadY = null;

/**
 * Ratios become grid tracks. The px floor in each minmax() is the same constant
 * the drag clamp uses — they have to agree, which is why both read it from
 * shared/core.js rather than each keeping its own number.
 */
function applyLayout() {
  const track = (ratio, minPx) =>
    `minmax(${minPx}px, ${(ratio * 100).toFixed(3)}fr) ` +
    `minmax(${minPx}px, ${((1 - ratio) * 100).toFixed(3)}fr)`;

  const grid = $("#matrixView");
  grid.style.gridTemplateColumns = track(layout.cols, MIN_COL_PX);
  grid.style.gridTemplateRows = track(layout.rows, MIN_ROW_PX);
  // Say out loud what those row floors add up to. Without it the grid is a
  // flex item that shrinks below its own contents and lets them run off the
  // bottom of the window -- which is what the inbox did to the lower two
  // quadrants at the minimum window size. Stated here rather than in CSS
  // because the floors are already known here, and two copies of 110 would
  // drift the first time one of them changed.
  //
  // The padding has to be in the number: box-sizing is border-box, so a
  // min-height of just the tracks leaves the grid 20px short of what it
  // promised and the bottom row runs over anyway. Measured rather than
  // written down, and only once -- this runs on every pointermove of an edge
  // drag, and getComputedStyle there would force a layout each time.
  if (gridPadY === null) {
    const cs = getComputedStyle(grid);
    gridPadY =
      (Number.parseFloat(cs.paddingTop) || 0) +
      (Number.parseFloat(cs.paddingBottom) || 0);
  }
  grid.style.minHeight = `${2 * MIN_ROW_PX + GUTTER + gridPadY}px`;
}

/**
 * Persist the ratios, debounced: a drag fires this on every pointermove and
 * each call would otherwise be an IPC round trip and a file write.
 */
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

/**
 * Bind the whole edge interaction: hover to mark, drag to resize, double-click
 * to re-centre. Bound to the grid rather than to the quadrants so the pointer
 * keeps being tracked when it crosses the gutter between them.
 */
export function wireQuadEdges() {
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

/**
 * Take the ratios from the saved settings and draw them. Sanitised through the
 * same helper main.js uses, so a hand-edited data.json cannot produce a track
 * the grid refuses to lay out.
 */
export function setLayout(saved) {
  layout = sanitizeLayout(saved);
  applyLayout();
}
