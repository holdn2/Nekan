/**
 * The vocabulary the rest of src/shared/ is written in.
 *
 * A module of its own rather than part of core, because core is still the one
 * file the renderer loads as a classic <script> and a script may not import
 * anything. When core-bridge goes and core becomes a real module, these can
 * move in beside the functions that produce them -- until then this is the one
 * place that names them, which is the part that matters.
 *
 * Types only. Nothing here emits, so importing it costs nothing at runtime.
 */

/** The four boxes of the matrix. Drives every 2x2 loop. */
export type Quadrant = "q1" | "q2" | "q3" | "q4";

/** Every legal value of `task.quadrant` -- the four, plus the staging list. */
export type Place = "inbox" | Quadrant;

/** Which of the two matrices a task belongs to. Orthogonal to Place. */
export type Space = "work" | "life";

/**
 * A task, after normalizeTasks has been over it.
 *
 * Four of these fields are timestamps that spell out one state between them,
 * and not one of them is a flag: active is all three null, and a purged row is
 * a tombstone that stays in the file with its text emptied. Nothing is ever
 * removed from the array except by dropExpiredTombstones.
 */
export interface Task {
  id: string;
  text: string;
  quadrant: Place;
  /** null exactly when quadrant is the inbox -- that is what shares it. */
  space: Space | null;
  /** Sorts within one (quadrant, space). Never compare across two. */
  orderKey: string | null;
  memo: string | null;
  dueDate: string | null;
  createdAt: number;
  /** What last-write-wins compares. Written through the renderer's now(). */
  updatedAt: number;
  completedAt: number | null;
  deletedAt: number | null;
  purgedAt: number | null;
}

/** What the stylesheets colour a due chip by.a computed value, not a worded one. */
export type DueState = "overdue" | "today" | "soon" | "far";

/**
 * Everything formatDue needs, and not one string.
 *
 * dueInfo() computes; formatDue() words it. They are apart because core has no
 * catalogue -- it is handed `t` -- and because `state` is what the CSS colours
 * by, which must not depend on the language on screen.
 */
export interface DueInfo {
  date: Date;
  days: number;
  state: DueState;
  otherYear: boolean;
}

/** Screen geometry, in the DIP the main process measures windows in. */
export interface Point {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}
export interface Rect extends Point, Size {}

/** The two grid ratios and the two panel heights, as stored in settings. */
export interface Layout {
  cols: number;
  rows: number;
  /** px, or null for "whatever the stylesheet says". */
  inbox: number | null;
  memo: number | null;
}

/**
 * A signed-in session as it is held on disk, tokens and all.
 *
 * Never leaves the main process. What the renderer is told is PublicSession,
 * and the difference between the two is the point of publicSession(): it picks
 * the fields to hand over rather than deleting the ones to withhold, so a field
 * added here does not leak by default.
 */
export interface Session {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. REFRESH_SKEW_MS before this, the session is renewed. */
  expiresAt: number;
  /**
   * Both nullable, and deliberately. A token reply can arrive with no user
   * object attached -- the tokens are what the app runs on, so that is still a
   * session -- and blanking them to "" instead would make a signed-in state
   * that claims to know who it is. test/auth.test.js pins this.
   */
  userId: string | null;
  email: string | null;
}

/**
 * Everything about the session the renderer is allowed to know.
 *
 * Both nullable, because publicSession() turns an empty string into null and a
 * reply can arrive with tokens but no user attached. The renderer already has
 * to handle "signed in, name unknown".
 */
export interface PublicSession {
  userId: string | null;
  email: string | null;
}
