/**
 * The DOM helpers every view reaches for. Nothing here knows what a task is —
 * it is all "find that element" and "build this little piece of chrome", which
 * is what makes it safe for any module to import.
 */

/** First match of `sel`, short enough to inline in a render loop. */
export const $ = (sel, root = document) => root.querySelector(sel);

/** All matches of `sel`, as a real array so map/filter/forEach work on it. */
export const $$ = (sel, root = document) =>
  Array.from(root.querySelectorAll(sel));

/**
 * The "1." "2." ordinal that opens every list row. The number is the position
 * in the list on screen, not anything stored on the task — history and trash
 * restart it inside each day group.
 */
export function numEl(index) {
  const el = document.createElement("span");
  el.className = "num";
  el.textContent = `${index + 1}.`;
  return el;
}

/**
 * A text button for the history / trash rows. `danger` is for the ones that
 * throw something away (삭제 / 영구 삭제), which the stylesheet tints red.
 */
export function actionBtn(label, onClick, danger = false) {
  const btn = document.createElement("button");
  btn.className = danger ? "act danger" : "act";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

/**
 * Title and accessible name always move together on the icon-only buttons —
 * they carry no text, so a screen reader would otherwise just say "button".
 */
export function labelBtn(sel, label) {
  const btn = $(sel);
  btn.title = label;
  btn.setAttribute("aria-label", label);
}
