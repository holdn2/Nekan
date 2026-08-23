/**
 * The ratios the grid is laid out with, and the room the two panels have.
 *
 * The numbers are CSS's, read back rather than duplicated: --gutter comes out
 * of base.css through getComputedStyle, and the floors come from shared/core
 * so a drag and the grid's own minmax() cannot disagree.
 *
 * Both room() functions are read once per drag and never during one. The panel
 * and the matrix swap height as the pointer moves, so measuring mid-drag would
 * feed the answer back into itself.
 */

import {
  DEFAULT_LAYOUT,
  MIN_COL_PX,
  MIN_INBOX_PX,
  MIN_ROW_PX,
  sanitizeLayout,
} from "../../../shared/core.js";
import type { Layout } from "../../../shared/types.js";
import { $ } from "../../dom.js";

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

/** How far either side of the memo panel's top border the grab zone reaches. */
const MEMO_HIT = 6;

/** The dump's list, whose height the edge above the matrix drags. */
const inboxList = () => $("#inboxList");
/** No edge to grab while it is folded: there is nothing between the two. */
const dumpOpen = () => $("#inboxPanel")?.classList.contains("open");

/** Which divider a pointer is on, or none. */
type Edge = "inbox" | "col" | "row" | "both" | "memo" | null;
/** Where a panel drag started: read once at pointerdown, never live. */
interface DragStart {
  y: number;
  height: number;
  room: number;
}

let layout = { ...DEFAULT_LAYOUT };
let layoutTimer: ReturnType<typeof setTimeout> | null = null;
/** The grid's own padding, measured once — applyLayout runs on every drag move. */
let gridPadY: number | null = null;

/**
 * Ratios become grid tracks. The px floor in each minmax() is the same constant
 * the drag clamp uses — they have to agree, which is why both read it from
 * shared/core.js rather than each keeping its own number.
 */
function applyLayout() {
  const track = (ratio: number, minPx: number) =>
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

  // The dump reads this instead of its stylesheet default. Cleared rather than
  // set to the default so the CSS keeps owning the untouched case -- 26vh is a
  // share of the window, and writing today's pixels into the variable would
  // freeze it at the size of whatever window it was last dragged in.
  const root = document.documentElement;
  if (layout.inbox === null) root.style.removeProperty("--inbox-h");
  else root.style.setProperty("--inbox-h", `${layout.inbox}px`);

  // Same arrangement for the memo panel.
  if (layout.memo === null) root.style.removeProperty("--memo-h");
  else root.style.setProperty("--memo-h", `${layout.memo}px`);
}

/** The panel's height as the stylesheet has it right now. */
function memoHeight() {
  return (
    Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--memo-h"),
    ) || 0
  );
}

/**
 * How tall the dump's list may be dragged right now: what it already has, plus
 * everything the matrix can give up before it reaches its own floor.
 *
 * Read once per drag rather than per move. The two boxes swap height as the
 * pointer moves, so measuring during the drag would feed the answer back into
 * itself and the limit would drift with the pointer.
 */
function inboxRoom() {
  const list = inboxList();
  const grid = $("#matrixView");
  if (!list || !grid) return MIN_INBOX_PX;
  const slack =
    grid.getBoundingClientRect().height -
    (Number.parseFloat(grid.style.minHeight) || 0);
  return list.getBoundingClientRect().height + Math.max(0, slack);
}

/**
 * Persist the ratios, debounced: a drag fires this on every pointermove and
 * each call would otherwise be an IPC round trip and a file write.
 */
function saveLayout() {
  if (layoutTimer) clearTimeout(layoutTimer);
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

/** Replace the ratios wholesale. The one write that is not a drag. */
function setLayoutRatios(saved: unknown) {
  layout = sanitizeLayout(saved);
}

export type { DragStart, Edge };
export {
  GUTTER,
  HIT,
  MEMO_HIT,
  dumpOpen,
  inboxList,
  layout,
  setLayoutRatios,
  applyLayout,
  memoHeight,
  inboxRoom,
  saveLayout,
  metrics,
};
