/**
 * How a memo shows up *on a list row*. The panel that edits one lives in
 * views/memo.js — these two are display only, which is why neither has a
 * dblclick handler, a contentEditable or a save path.
 */

import { noteIcon } from "./icons.js";

/**
 * Matrix rows are one line tall, so the memo itself cannot be shown there: the
 * marker says it exists and the full text rides along as the tooltip.
 */
export function memoMark(memo) {
  const el = document.createElement("span");
  el.className = "memo-mark";
  el.title = `메모: ${memo}`;
  el.setAttribute("aria-label", "메모 있음");
  el.append(noteIcon());
  return el;
}

/**
 * History / trash rows have the room to show the memo, so they do — clamped to
 * three lines by CSS and expanding on click. The pointer and the "전체 보기"
 * hint are *not* set here: only a memo that actually overflows should get them,
 * and that can only be measured once the row is in the document, so the archive
 * renderer flips the `clamped` class after insertion.
 */
export function memoLine(memo) {
  const box = document.createElement("div");
  box.className = "hmemo";

  const icon = document.createElement("span");
  icon.className = "memo-mark";
  icon.setAttribute("aria-hidden", "true");
  icon.append(noteIcon());

  const text = document.createElement("p");
  text.className = "hmemo-text";
  text.textContent = memo;

  box.append(icon, text);
  box.addEventListener("click", () => {
    // Let a click that was really a text selection stand.
    if (window.getSelection()?.toString()) return;
    if (!box.classList.contains("clamped")) return;
    box.title = box.classList.toggle("open") ? "접기" : "전체 보기";
  });
  return box;
}
