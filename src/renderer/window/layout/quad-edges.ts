/**
 * Dragging the cross between the four quadrants, and the dump's edge above it.
 *
 * Bound to the grid rather than to each quadrant, so the pointer keeps being
 * tracked while it crosses the gutter between them -- a listener per quadrant
 * loses the drag in the gap.
 *
 * There is no splitter element to grab: the gutter is CSS grid gap, and the
 * pointer is tested against centre lines measured off the corner quadrants.
 * Real dividers would be four more elements the drop zones would have to
 * ignore.
 */

import {
  DEFAULT_LAYOUT,
  MIN_COL_PX,
  MIN_INBOX_PX,
  MIN_ROW_PX,
  QUADS,
  clampAxis,
  clampInbox,
} from "../../../shared/core.js";
import type { Layout } from "../../../shared/types.js";
import { $ } from "../../dom.js";
import type { DragStart, Edge } from "./grid.js";
import {
  GUTTER,
  HIT,
  MEMO_HIT,
  applyLayout,
  dumpOpen,
  inboxList,
  inboxRoom,
  layout,
  memoHeight,
  metrics,
  saveLayout,
} from "./grid.js";

/**
 * Which divider the point is on: "inbox", "col", "row", "both", or null.
 *
 * The dump's edge is tested first and against the whole width. It is the top
 * of the grid, so a pointer there is also inside the first quadrant's column
 * band, and asking about the quadrants first would make the corner of the
 * matrix ungrabbable.
 */
function edgeAt(x: number, y: number): Edge {
  const grid = $("#matrixView");
  if (dumpOpen()) {
    const g = grid.getBoundingClientRect();
    if (x >= g.left && x <= g.right && y >= g.top && y - g.top <= HIT) {
      return "inbox";
    }
  }
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
function markEdge(mode: Edge) {
  const grid = $("#matrixView");
  grid.classList.toggle("edge-inbox", mode === "inbox");
  grid.classList.toggle("edge-col", mode === "col");
  grid.classList.toggle("edge-row", mode === "row");
  grid.classList.toggle("edge-both", mode === "both");

  if (mode === "inbox") {
    QUADS.forEach((q) => {
      const el = $(`[data-quad="${q}"]`);
      el.classList.remove("edge-r", "edge-l", "edge-b");
    });
    return;
  }
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
function wireQuadEdges() {
  const grid = $("#matrixView");
  let dragging: Edge = null;

  /** Set at pointerdown for a dump drag; see inboxRoom for why it is not live. */
  let dumpStart: DragStart | null = null;

  /** Pointer position → the ratios for whichever axes are being dragged. */
  const ratiosAt = (ev: PointerEvent) => {
    const m = metrics();
    const next: Partial<Layout> = {};
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
    if (mode === "inbox") {
      const list = inboxList();
      dumpStart = {
        y: e.clientY,
        height: list.getBoundingClientRect().height,
        room: inboxRoom(),
      };
    }
    dragging = mode;
    markEdge(mode);
    grid.setPointerCapture(e.pointerId);
    document.body.classList.add(`resizing-${mode}`);

    const onMove = (ev: PointerEvent) => {
      if (dragging === "inbox" && dumpStart) {
        layout.inbox = clampInbox(
          dumpStart.height + (ev.clientY - dumpStart.y),
          dumpStart.room,
        );
      } else {
        Object.assign(layout, ratiosAt(ev));
      }
      applyLayout();
      saveLayout();
    };
    // lostpointercapture is the backstop: however the drag ends — button
    // released off-window, capture stolen — the listeners come off.
    const onUp = (ev: PointerEvent) => {
      dragging = null;
      dumpStart = null;
      document.body.classList.remove(
        "resizing-col",
        "resizing-row",
        "resizing-both",
        "resizing-inbox",
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
    if (mode === "inbox") layout.inbox = DEFAULT_LAYOUT.inbox;
    if (mode === "col" || mode === "row" || mode === "both") {
      if (mode !== "row") layout.cols = DEFAULT_LAYOUT.cols;
      if (mode !== "col") layout.rows = DEFAULT_LAYOUT.rows;
    }
    applyLayout();
    saveLayout();
  });
}

export { wireQuadEdges };
