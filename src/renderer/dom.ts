/**
 * The DOM helpers every view reaches for. Nothing here knows what a task is —
 * it is all "find that element" and "build this little piece of chrome", which
 * is what makes it safe for any module to import.
 */

/**
 * First match of `sel`, short enough to inline in a render loop.
 *
 * Answers HTMLElement rather than Element, which is what every caller in this
 * app actually has -- the markup is HTML and the code reaches for `.dataset`,
 * `.value` and `.style` constantly. A caller wanting something narrower says
 * so: `$<HTMLInputElement>("#memoInput")`.
 *
 * The null is not modelled. Every selector here names an element that
 * index.html declares, so a miss is a typo rather than a state, and threading
 * `?.` through every call site would hide the typo instead of crashing on it.
 */
export const $ = <T extends HTMLElement = HTMLElement>(
  sel: string,
  root: ParentNode = document,
): T => root.querySelector(sel) as T;

/** All matches of `sel`, as a real array so map/filter/forEach work on it. */
export const $$ = <T extends HTMLElement = HTMLElement>(
  sel: string,
  root: ParentNode = document,
): T[] => Array.from(root.querySelectorAll(sel)) as T[];

/**
 * The element an event happened on.
 *
 * `Event.target` is an EventTarget, which is true of a WebSocket as much as of
 * a div, so every listener that wants `closest()` or `value` has to say which
 * it has. Saying it here once keeps the assertion out of the handlers, where it
 * would read as noise.
 */
export const target = <T extends HTMLElement = HTMLElement>(e: Event): T =>
  e.target as T;
