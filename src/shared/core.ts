/**
 * Pure logic shared by the main process, the renderer and the tests.
 *
 * One ES module, read by three runtimes and soon a fourth: the renderer
 * imports it as a browser module, main and the tests require() it -- Node has
 * been able to require an ES module since 22.12 -- and the mobile client will
 * read this source directly. So it must stay free of Node APIs, DOM APIs and
 * side effects, which tsconfig.shared.json now enforces rather than asks for.
 *
 * The logic itself sits in the files beside this one, split by what it is
 * about, in core/ beside this file; this is the door everything knocks on. `export *` rather than
 * a hand-written list -- a name left out of one of those is a runtime error
 * with no compile-time warning, which this repo has paid for once already.
 */

import type {
  DueInfo,
  DueState,
  Layout,
  Place,
  Point,
  Quadrant,
  Rect,
  Size,
  Space,
  Task,
} from "./types.js";

// Re-exported so a consumer needs one import, not two. These are produced by
// the modules below; types.ts is only where they are written down.
export type {
  DueInfo,
  DueState,
  Layout,
  Place,
  Point,
  Quadrant,
  Rect,
  Size,
  Space,
  Task,
};

export * from "./core/places.js";
export * from "./core/text.js";
export * from "./core/dates.js";
export * from "./core/order.js";
export * from "./core/tasks.js";
export * from "./core/layout.js";
export * from "./core/placement.js";
