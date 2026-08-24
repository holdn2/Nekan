/**
 * Folding into the bar and opening back out, on every starting position.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { expandOrigin, collapseOrigin } from "#shared/core.js";

/** A 1920x1080 display starting at the origin, minus nothing. */
const SCREEN = { x: 0, y: 0, width: 1920, height: 1080 };
const BAR = { width: 600, height: 48 };
const WIN = { width: 1000, height: 700 };

/* -------------------------------------------------- expand / collapse spot */

test("the window grows from the bar's own corner", () => {
  const bar = { x: 200, y: 140, width: BAR.width, height: BAR.height };
  assert.deepEqual(expandOrigin(bar, WIN, SCREEN), { x: 200, y: 140 });
});

test("a bar near the right edge grows leftwards instead", () => {
  // Growing right from 1200 would end at 2200 on a 1920 screen: most of the
  // window would be off the display.
  const bar = { x: 1200, y: 60, width: BAR.width, height: BAR.height };
  const at = expandOrigin(bar, WIN, SCREEN);
  // The two right edges line up: 1200 + 600 === 800 + 1000.
  assert.deepEqual(at, { x: 800, y: 60 });
  assert.equal(at.x + WIN.width, bar.x + bar.width);
});

test("the bar folds out of whichever side the window is on", () => {
  const left = { x: 100, y: 90, width: WIN.width, height: WIN.height };
  assert.deepEqual(collapseOrigin(left, BAR, SCREEN), { x: 100, y: 90 });

  const right = { x: 800, y: 90, width: WIN.width, height: WIN.height };
  // Right edges line up again: 800 + 1000 === 1200 + 600.
  assert.deepEqual(collapseOrigin(right, BAR, SCREEN), { x: 1200, y: 90 });
});

test("opening and folding a right-hand window is a round trip", () => {
  // The pair has to settle, or every toggle would walk the widget across the
  // screen. A bar on the right opens left-aligned to itself and folds back to
  // exactly where it started.
  const bar = { x: 1200, y: 300, width: BAR.width, height: BAR.height };
  const opened = { ...expandOrigin(bar, WIN, SCREEN), ...WIN };
  const folded = collapseOrigin(opened, BAR, SCREEN);
  assert.deepEqual(folded, { x: bar.x, y: bar.y });
});

test("a window in the middle settles after one fold", () => {
  // Nothing forces the first fold to stay put — but the second cycle must.
  const bar = { x: 700, y: 200, width: BAR.width, height: BAR.height };
  const opened = { ...expandOrigin(bar, WIN, SCREEN), ...WIN };
  const folded = collapseOrigin(opened, BAR, SCREEN);

  const reopened = {
    ...expandOrigin(
      { ...folded, width: BAR.width, height: BAR.height },
      WIN,
      SCREEN,
    ),
    ...WIN,
  };
  assert.deepEqual(reopened, opened, "the window must not walk");
  assert.deepEqual(collapseOrigin(reopened, BAR, SCREEN), folded);
});

test("folding and opening again puts the window back, from anywhere", () => {
  // The spot checks above cover the two corners; this covers the middle, which
  // is where the pair used to disagree. Fold a window at every x it can start
  // at and open it again -- it has to land on the pixel it left from, or the
  // widget walks across the screen a bit at a time and the user cannot say why.
  const moved = [];
  for (let x = 0; x <= SCREEN.width - WIN.width; x++) {
    const opened = { ...WIN, x, y: 300 };
    const folded = collapseOrigin(opened, BAR, SCREEN);
    const back = expandOrigin(
      { ...folded, width: BAR.width, height: BAR.height },
      WIN,
      SCREEN,
    );
    if (back.x !== x) moved.push(`${x} -> ${back.x}`);
  }
  assert.deepEqual(moved, [], `${moved.length} start positions moved`);
});

test("placement follows the display the window is actually on", () => {
  // A second monitor to the right: "the right half" is that monitor's half.
  const second = { x: 1920, y: 0, width: 1920, height: 1080 };
  const bar = { x: 2000, y: 50, width: BAR.width, height: BAR.height };
  assert.deepEqual(expandOrigin(bar, WIN, second), { x: 2000, y: 50 });

  const nearEdge = { x: 3200, y: 50, width: BAR.width, height: BAR.height };
  assert.deepEqual(expandOrigin(nearEdge, WIN, second), { x: 2800, y: 50 });
});

test("a bar at the bottom is pushed up until the window fits", () => {
  // Growing downwards from 1032 would end at 1732 on a 1080 screen and leave
  // the whole app below the desktop.
  const bar = { x: 200, y: 1032, width: BAR.width, height: BAR.height };
  const at = expandOrigin(bar, WIN, SCREEN);
  assert.deepEqual(at, { x: 200, y: 380 });
  assert.equal(at.y + WIN.height, SCREEN.y + SCREEN.height);
});

test("a taskbar takes its strip out of the work area", () => {
  // workArea, not the whole display: the window may not sit under the taskbar.
  const withTaskbar = { x: 0, y: 0, width: 1920, height: 1032 };
  const bar = { x: 100, y: 900, width: BAR.width, height: BAR.height };
  assert.deepEqual(expandOrigin(bar, WIN, withTaskbar), { x: 100, y: 332 });
});

test("a window larger than the display gets the near corner", () => {
  // No placement fits. Hanging off the far edge would hide the title bar and
  // with it the only way to move the window back.
  const small = { x: 0, y: 0, width: 800, height: 600 };
  const bar = { x: 100, y: 100, width: BAR.width, height: BAR.height };
  assert.deepEqual(expandOrigin(bar, WIN, small), { x: 0, y: 0 });
});

test("the bar cannot be folded off the edge either", () => {
  const offRight = { x: 1500, y: 1050, width: WIN.width, height: WIN.height };
  const at = collapseOrigin(offRight, BAR, SCREEN);
  assert.ok(at.x + BAR.width <= SCREEN.width, `x=${at.x}`);
  assert.ok(at.y + BAR.height <= SCREEN.height, `y=${at.y}`);
});
