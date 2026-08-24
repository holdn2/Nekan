/**
 * How a memo shows up on a *matrix* row: a marker, with the text as the
 * tooltip, because those rows are one line tall.
 *
 * Display only -- no double-click handler, no contentEditable, no save path.
 * The panel that edits one is views/memo.tsx; the history and trash rows,
 * which have room to show the whole memo, use components/memo-line.tsx.
 */

import { t } from "../i18n.js";
import { NoteIcon } from "../react/icons.js";

export function MemoMark({ memo }: { memo: string }) {
  return (
    <span
      className="memo-mark"
      role="img"
      title={t("memo.mark", { memo })}
      aria-label={t("memo.markLabel")}
    >
      <NoteIcon />
    </span>
  );
}
