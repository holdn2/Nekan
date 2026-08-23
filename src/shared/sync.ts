/**
 * The decisions sync has to make, as functions of their inputs alone.
 *
 * Nothing here talks to a network or a file. What is left is the part that is
 * actually hard to get right and impossible to eyeball: which of two versions
 * of a task wins, what still needs sending, and where the cursor moved to. The
 * HTTP, the tokens and the retries live in main/ and are boring by comparison.
 *
 * Required of main/ and the tests only -- never loaded by the renderer. The
 * pieces are in sync/ beside this file; this is the door they are behind.
 */

export * from "./sync/rows.js";
export * from "./sync/merge.js";
export * from "./sync/cursor.js";
export * from "./sync/clock.js";
