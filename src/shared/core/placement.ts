/**
 * Where the window goes when it folds into the bar, and where the bar goes
 * when it opens back up.
 *
 * The pair has to ask the same question -- is this thing on the right half of
 * the display? -- or a round trip does not land where it started. The comment
 * on expandOrigin() has the measurements from the time it did not.
 */

import type { Point, Rect, Size } from "../types.js";

/**
 * Keep a `length` long window starting at `start` inside `min`..`min + span`.
 * A window taller or wider than the display gets the near edge; there is no
 * placement that fits, and hanging off the far edge hides the title bar.
 */
function clampSpan(
  start: number,
  length: number,
  min: number,
  span: number,
): number {
  return Math.min(Math.max(start, min), Math.max(min, min + span - length));
}

/**
 * Where the expanded window goes when the bar grows into it.
 *
 * It asks the same question collapseOrigin asks — is this thing on the right
 * half of the display? — and that is the whole point. A bar on the right lines
 * its right edge up with the window's; one on the left grows from its own
 * top-left corner, where the user just clicked.
 *
 * It used to ask a different question: whether the window would fit if it grew
 * rightwards. That reads sensibly on its own and is wrong as half of a pair,
 * because a bar can sit right of centre and still have room to its right. Fold
 * such a window and it lands right-aligned; open it again and it grows the
 * other way, so the widget takes a step across the screen. Swept over every
 * starting position on a 2304px display, 333 of 1303 of them moved, by as much
 * as 318px; asking the mirrored question moves none of them.
 *
 * Vertically there is no such pivot — the window simply grows downwards — so a
 * bar near the bottom is pushed up by the clamp until it fits. Both axes are
 * clamped here rather than left to the caller: this is the function that knows
 * how big the window is about to become.
 *
 * `bar` is where the bar is *now*, never a remembered position — moving the
 * bar and then opening it has to open it where it was left.
 */
export function expandOrigin(bar: Rect, size: Size, area: Rect): Point {
  const middleOfScreen = area.x + area.width / 2;
  const onTheRight = bar.x + bar.width / 2 > middleOfScreen;
  const x = onTheRight ? bar.x + bar.width - size.width : bar.x;
  return {
    x: clampSpan(x, size.width, area.x, area.width),
    y: clampSpan(bar.y, size.height, area.y, area.height),
  };
}

/**
 * Where the bar goes when the expanded window folds into it.
 *
 * The window keeps whichever side of the display it is on: one whose middle is
 * past the middle of the screen folds onto its own right edge, so the bar stays
 * under the eye instead of jumping left and leaving a gap.
 *
 * This pairs with expandOrigin(): a window that was opened right-aligned folds
 * back to exactly the bar position it came from. A window sitting in the middle
 * can shift once on its first fold, and is stable from then on.
 */
export function collapseOrigin(bounds: Rect, bar: Size, area: Rect): Point {
  const middleOfScreen = area.x + area.width / 2;
  const onTheRight = bounds.x + bounds.width / 2 > middleOfScreen;
  const x = onTheRight ? bounds.x + bounds.width - bar.width : bounds.x;
  return {
    x: clampSpan(x, bar.width, area.x, area.width),
    y: clampSpan(bounds.y, bar.height, area.y, area.height),
  };
}
