/**
 * Where a task may sit, and which board it belongs to.
 *
 * The two are separate on purpose. A quadrant is a place on the grid; a space
 * is which of the two matrices the row belongs to, and it is a field on the
 * task rather than a file of its own. The one rule tying them together --
 * inbox means no space -- is decided by spaceFor() and nowhere else.
 */

import type { Place, Quadrant, Space } from "../types.js";

export const QUADS: Quadrant[] = ["q1", "q2", "q3", "q4"];
/**
 * The staging list above the matrix, where a task waits before it is classified.
 * It is a fifth value for `quadrant`, not a fifth quadrant: QUADS still drives
 * every 2×2 grid loop (renderMatrix, markEdge, the counts), so the inbox has to
 * be rendered on its own and cannot be folded into those.
 */
export const INBOX = "inbox" as const;
/** Every place a task may legally sit. */
export const PLACES: Place[] = [INBOX, ...QUADS];

/**
 * Is this one of them?
 *
 * For values read back out of the document, where the type is whatever the DOM
 * says -- a string, or nothing at all. Worth checking rather than asserting:
 * a quadrant the renderer does not know is not a visible error, it is a task
 * that stops being drawn, because every list on screen is a filter on this
 * field.
 */
export const isPlace = (value: unknown): value is Place =>
  typeof value === "string" && (PLACES as string[]).includes(value);

/** Where a task with an unknown quadrant lands. */
export const FALLBACK_QUAD: Quadrant = "q4";

/**
 * When a quadrant is holding more than the method it stands for can carry.
 *
 * Only q1 gets a number, and it is the guide's own: "1분면이 5개를 넘으면
 * 우선순위가 없는 것과 같습니다". The others deliberately have none — q2 being
 * full is the entire point of the exercise, and putting a ceiling on q3 or q4
 * would be advice this app has never given anyone.
 *
 * It marks and never blocks. Refusing a task sends it back into somebody's
 * head, which is the one thing 다 꺼내기 exists to prevent.
 */
export const CROWDED: Partial<Record<Place, number>> = { q1: 5 };

/** True when `count` is past the point that quadrant stops meaning anything. */
// `quadrant` is whatever the caller has, including nothing: the bar asks about
// places that may not be quadrants at all, and the answer for those is false.
export const isCrowded = (quadrant: Place | undefined, count: unknown) =>
  Number(count) > (CROWDED[quadrant as Place] ?? Infinity);

/**
 * The two matrices the header toggle switches between. This is a property of
 * the *task*, not of the file: both boards live in one data.json, so a task
 * moving between them is one atomic save like every other change.
 *
 * The inbox is deliberately outside the split — it is shared, so anything
 * sitting there has `space: null` and shows up on both boards. Classifying it
 * (dragging it down into a quadrant) is what gives it a space.
 */
export const SPACES: Space[] = ["work", "life"];
/** Where tasks saved before the split — and any unknown value — land. */
export const DEFAULT_SPACE: Space = "work";

/** Any unknown value — including undefined — reads as the default board. */
export const sanitizeSpace = (v: unknown): Space =>
  SPACES.includes(v as Space) ? (v as Space) : DEFAULT_SPACE;

/**
 * The space a task in `quadrant` should carry. Kept in one place because both
 * the renderer (on add / drop) and `normalizeTasks` have to agree that the
 * inbox is space-less; if they drift, a shared task starts showing on only one
 * board or a classified one on neither.
 */
export function spaceFor(quadrant: Place, space: unknown): Space | null {
  if (quadrant === INBOX) return null;
  return sanitizeSpace(space);
}

/**
 * Is the first-run question still unanswered?
 *
 * Shared because two processes act on the same answer and must not disagree:
 * the renderer decides whether to put the screen up, and main decides whether
 * it may return to bar mode at all. A 640x48 bar cannot hold a 380px card, and
 * main is the only side that can keep the window out of it in the first place —
 * by the time the renderer hears about the mode, it has already collapsed.
 */
export const needsStartupChoice = (choice: unknown) =>
  choice !== "sync" && choice !== "local";

/** Must match the add form's maxlength in index.html. */
