/**
 * How a memo shows up on a *matrix* row: a marker, with the text as the
 * tooltip, because those rows are one line tall.
 *
 * Display only -- no dblclick handler, no contentEditable, no save path. The
 * panel that edits one is views/memo.tsx; the history and trash rows, which
 * have room to show the whole memo, use components/memo-line.tsx.
 */

import { t } from "../i18n.js";
import { noteIcon } from "./icons.js";

/**
 * Matrix rows are one line tall, so the memo itself cannot be shown there: the
 * marker says it exists and the full text rides along as the tooltip.
 */
export function memoMark(memo: string) {
  const el = document.createElement("span");
  el.className = "memo-mark";
  el.title = t("memo.mark", { memo });
  el.setAttribute("aria-label", t("memo.markLabel"));
  el.append(noteIcon());
  return el;
}
