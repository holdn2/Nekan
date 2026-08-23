/**
 * The proportions of the grid, and the floors that keep a pane usable.
 *
 * Ratios and pixel minimums live together because they constrain each other:
 * clampAxis() turns a pixel floor into a ratio one, and applyLayout() uses the
 * same MIN_COL_PX as the bottom of its minmax(). Two copies of either number
 * would drift the day one of them changes.
 */

import type { Layout } from "../types.js";

/**
 * `inbox` and `memo` are heights in px, not ratios, and null means "whatever
 * the stylesheet says". The quadrants split a fixed box so a ratio is the
 * natural unit there; those two panels are told how tall to be, and what the
 * user wants is a list this tall -- not a list that is a quarter of whatever
 * the window happens to be.
 *
 * Both take their height out of the matrix, so both have the same ceiling:
 * whatever the grid can give up, which only the renderer can work out. That is
 * why neither is clamped from above here.
 */
export const DEFAULT_LAYOUT: Layout = {
  cols: 0.5,
  rows: 0.5,
  inbox: null,
  memo: null,
};
export const MIN_RATIO = 0.15;
export const MAX_RATIO = 0.85;

/** Keep a quadrant from being dragged away to nothing. */
export const clampRatio = (v: number) =>
  Math.min(MAX_RATIO, Math.max(MIN_RATIO, v));

/**
 * Smallest a quadrant may be dragged to, in pixels, where the window can afford
 * it. They live here with the ratio bounds because the drag clamp below and the
 * renderer's grid `minmax()` floor have to be the same number — if they drift,
 * the drag stops at one size while the grid lays out at another.
 */
export const MIN_COL_PX = 180;
export const MIN_ROW_PX = 110;

/**
 * Smallest the dump's list may be dragged to: one row and its padding. Below
 * that the panel says nothing the folded header does not already say, and the
 * fold is the control for "I do not want this open".
 */
export const MIN_INBOX_PX = 56;

/**
 * Smallest the memo panel may be dragged to: its header and the first line of
 * the note. Below that the panel says nothing the row's memo mark does not
 * already say, and closing the note is the control for "not now".
 */
export const MIN_MEMO_PX = 96;

/**
 * How tall the memo panel may be, given the room there is for it.
 *
 * The twin of clampInbox, floor apart, and for the same reason: `available` is
 * the panel's own height plus everything the matrix can give up, and only the
 * renderer knows what the grid is currently doing.
 */
export function clampMemoPanel(value: number, available: number): number {
  if (!Number.isFinite(value)) return MIN_MEMO_PX;
  return Math.max(
    MIN_MEMO_PX,
    Math.min(Math.round(value), Math.round(available)),
  );
}

/**
 * How tall the dump's list may be, given the room there is for it.
 *
 * `available` is the list's own height plus everything the matrix can give up
 * before it hits its own floor -- the caller works that out, because only the
 * renderer knows what the grid is currently doing. When there is not even the
 * minimum to be had, the minimum still wins: the matrix has its own overflow
 * rules for that case, and a list of zero height would read as a broken panel.
 */
export function clampInbox(value: number, available: number): number {
  if (!Number.isFinite(value)) return MIN_INBOX_PX;
  return Math.max(
    MIN_INBOX_PX,
    Math.min(Math.round(value), Math.round(available)),
  );
}

/**
 * The clamp a drag uses: a pixel minimum while `span` is big enough to honour
 * it, and the plain ratio floor once it is not.
 *
 * The upper bound is `MAX_RATIO` and the mirror of the floor, whichever is
 * tighter. Taking the mirror alone would silently assume MAX_RATIO is always
 * 1 - MIN_RATIO, and changing one of them in this file would then not reach the
 * drag at all.
 */
export function clampAxis(value: number, span: number, minPx: number): number {
  if (!Number.isFinite(value)) return 0.5;
  const floor = span > 0 ? Math.min(minPx / span, 0.5) : MIN_RATIO;
  const low = Math.max(MIN_RATIO, floor);
  const high = Math.min(MAX_RATIO, 1 - low);
  return Math.min(high, Math.max(low, value));
}

/** Ratios are always real numbers in the store; null/"" must not read as 0. */
const asRatio = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? v : NaN;

/** Keep only sane numbers; anything else falls back to an even split. */
export function sanitizeLayout(saved: unknown): Layout {
  const from = (saved ?? {}) as Record<string, unknown>;
  const next = { ...DEFAULT_LAYOUT };
  const cols = asRatio(from.cols);
  if (Number.isFinite(cols)) next.cols = clampRatio(cols);

  // Saves from the two-splitter layout gave each column its own row split;
  // the grid has a single shared one, so average them.
  const rows = Number.isFinite(asRatio(from.rows))
    ? asRatio(from.rows)
    : (asRatio(from.left) + asRatio(from.right)) / 2;
  if (Number.isFinite(rows)) next.rows = clampRatio(rows);

  // Held loosely on purpose: the upper bound depends on the window, which this
  // file cannot see. Anything at or above the floor is kept and clamped again
  // when it is applied, so a saved height from a big monitor comes back intact
  // on a small one instead of being rounded away on the way in.
  const inbox = asRatio(from.inbox);
  next.inbox =
    Number.isFinite(inbox) && inbox >= MIN_INBOX_PX ? Math.round(inbox) : null;

  // Held loosely for the same reason as the dump: the ceiling is the window's.
  const memo = asRatio(from.memo);
  next.memo =
    Number.isFinite(memo) && memo >= MIN_MEMO_PX ? Math.round(memo) : null;
  return next;
}
