/**
 * Which places exist, which board a row belongs to, and when a quadrant is full.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  INBOX,
  CROWDED,
  isCrowded,
  DEFAULT_SPACE,
  sanitizeSpace,
  spaceFor,
  needsStartupChoice,
  normalizeTasks,
} from "#shared/core.js";
import type { Place } from "#shared/types.js";

test("the inbox belongs to no board, so both matrices show it", () => {
  // `space: null` is what makes "다 꺼내기" shared. A stale space on an inbox
  // task is dropped rather than honoured, or the row would show on one side
  // only after being dragged back up.
  const [fresh, stale] = normalizeTasks([
    { id: "a", text: "x", quadrant: INBOX },
    { id: "b", text: "y", quadrant: INBOX, space: "work" },
  ]);
  assert.equal(fresh.space, null);
  assert.equal(stale.space, null);
});

test("only q1 is ever crowded — a full q2 is the point of the method", () => {
  assert.equal(isCrowded("q1", CROWDED.q1), false);
  assert.equal(isCrowded("q1", CROWDED.q1 + 1), true);
  for (const q of ["q2", "q3", "q4", INBOX] as Place[]) {
    assert.equal(isCrowded(q, 9999), false, q);
  }
});

test("isCrowded survives a count that is not a number", () => {
  assert.equal(isCrowded("q1", undefined), false);
  assert.equal(isCrowded("q1", "몇 개"), false);
  assert.equal(isCrowded(undefined, 9999), false);
});

test("spaceFor is the one rule both the renderer and normalize follow", () => {
  assert.equal(spaceFor(INBOX, "work"), null);
  assert.equal(spaceFor("q1", "life"), "life");
  assert.equal(spaceFor("q1", undefined), DEFAULT_SPACE);
  assert.equal(sanitizeSpace("life"), "life");
  assert.equal(sanitizeSpace("nope"), DEFAULT_SPACE);
});

test("needsStartupChoice keeps main and the renderer on one answer", () => {
  // A 1.0.2 file has no such key, and its owner has to meet the screen once.
  assert.equal(needsStartupChoice(undefined), true);
  assert.equal(needsStartupChoice(null), true);
  // Anything that is not one of the two answers is not an answer. Main leans on
  // this to decide it may not open as a bar, so a stray value has to read as
  // unanswered rather than let a 380px card into a 48px window.
  assert.equal(needsStartupChoice("later"), true);
  assert.equal(needsStartupChoice("sync"), false);
  assert.equal(needsStartupChoice("local"), false);
});
