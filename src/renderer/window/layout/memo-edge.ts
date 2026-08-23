/**
 * Dragging the line above the memo panel.
 *
 * It grows upwards, unlike the dump's edge: the panel is below the line, so
 * pulling up is what gives it height. What it can take comes from the matrix,
 * and when the matrix is already at its floor the answer is zero -- an edge
 * that will not move is correct then, not broken.
 */

import {
  DEFAULT_LAYOUT,
  MIN_MEMO_PX,
  MIN_ROW_PX,
  clampMemoPanel,
} from "../../../shared/core.js";
import { $ } from "../../dom.js";
import type { DragStart } from "./grid.js";
import {
  MEMO_HIT,
  applyLayout,
  layout,
  memoHeight,
  metrics,
  saveLayout,
} from "./grid.js";

/**
 * How tall the memo panel may be dragged right now: what it already has, plus
 * everything the matrix can give up before it reaches its own floor.
 *
 * The twin of inboxRoom, and read once per drag for the same reason -- the two
 * boxes swap height as the pointer moves, so measuring during the drag would
 * feed the answer back into itself.
 */
function memoRoom() {
  const panel = $("#memoPanel");
  const grid = $("#matrixView");
  if (!panel || !grid) return MIN_MEMO_PX;
  const slack =
    grid.getBoundingClientRect().height -
    (Number.parseFloat(grid.style.minHeight) || 0);
  return panel.getBoundingClientRect().height + Math.max(0, slack);
}

/**
 * Dragging the memo panel's top edge.
 *
 * Bound to the panel rather than folded into edgeAt(): that hit test walks the
 * corner quadrants to find the grid's own dividers, and this edge is not one
 * of them -- the panel is the grid's sibling, and the boundary is its border.
 *
 * The gesture is upside down compared with the dump's. Dragging up makes this
 * panel *taller*, because it hangs below the divider rather than above it.
 */
function wireMemoEdge() {
  const panel = $("#memoPanel");
  if (!panel) return;

  /** Set at pointerdown; see memoRoom for why it is not read live. */
  let start: DragStart | null = null;

  const shown = () => !panel.classList.contains("hidden");
  const onEdge = (y: number) =>
    shown() && Math.abs(y - panel.getBoundingClientRect().top) <= MEMO_HIT;

  panel.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !e.isPrimary || !onEdge(e.clientY)) return;
    e.preventDefault();

    start = { y: e.clientY, height: memoHeight(), room: memoRoom() };
    panel.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing-memo");

    const onMove = (ev: PointerEvent) => {
      if (!start) return;
      // Up is taller: the divider is this panel's top, so the height it gains
      // is exactly how far the pointer has climbed.
      layout.memo = clampMemoPanel(
        start.height - (ev.clientY - start.y),
        start.room,
      );
      applyLayout();
      saveLayout();
    };
    const onUp = () => {
      start = null;
      document.body.classList.remove("resizing-memo");
      panel.removeEventListener("pointermove", onMove);
      panel.removeEventListener("pointerup", onUp);
      panel.removeEventListener("pointercancel", onUp);
      panel.removeEventListener("lostpointercapture", onUp);
    };

    panel.addEventListener("pointermove", onMove);
    panel.addEventListener("pointerup", onUp);
    panel.addEventListener("pointercancel", onUp);
    panel.addEventListener("lostpointercapture", onUp);
  });

  // Double-clicking the edge puts it back to the stylesheet's height, the same
  // as double-clicking a quadrant divider. Cleared rather than assigned, so the
  // default keeps living in one place.
  panel.addEventListener("dblclick", (e) => {
    if (!onEdge(e.clientY)) return;
    layout.memo = DEFAULT_LAYOUT.memo;
    applyLayout();
    saveLayout();
  });
}

export { wireMemoEdge };
