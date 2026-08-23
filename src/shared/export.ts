/**
 * Export documents built from the task list: Markdown to paste somewhere else,
 * HTML to read in a browser -- and the same HTML is what main prints to get the
 * PDF, so the three formats can never drift apart.
 *
 * Pure string building on purpose (no Node, DOM or Electron APIs) so the part
 * that is easy to get wrong -- which tasks are in, how an empty quadrant reads,
 * how text with `<` or `|` in it is escaped -- is testable without the app.
 *
 * The pieces are in export/ beside this file; this is the door main and the
 * tests knock on. `export *` rather than a hand-written list, for the reason
 * core.ts gives.
 */

export * from "./export/types.js";
export * from "./export/snapshot.js";
export * from "./export/markdown.js";
export * from "./export/html.js";
