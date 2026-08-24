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

import { applyLayout, setLayoutRatios } from "./layout/grid.js";

export { wireQuadEdges } from "./layout/quad-edges.js";
export { wireMemoEdge } from "./layout/memo-edge.js";

/**
 * Take the ratios from the saved settings and draw them. Sanitised through the
 * same helper main uses, so a hand-edited data.json cannot produce a track the
 * grid refuses to lay out.
 */
export function setLayout(saved: unknown) {
  setLayoutRatios(saved);
  applyLayout();
}
