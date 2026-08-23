/**
 * A memo, shown in full on a history or trash row.
 *
 * The matrix cannot do this -- its rows are one line tall, so there the memo is
 * a marker and a tooltip (components/memo-mark.ts, still hand-built because the
 * matrix is). Here there is room, so the text is on the row, clamped to three
 * lines by CSS and expanding on click.
 *
 * The clamp is measured rather than assumed: only a memo that actually
 * overflows gets the pointer and the hint, and whether it overflows depends on
 * the width it ended up with. That measurement used to happen in the archive
 * renderer, after it had inserted every row; it belongs to this component,
 * which is the thing that knows when its own text changed.
 */

import { useLayoutEffect, useRef, useState } from "react";
import { t } from "../i18n.js";
import { NoteIcon } from "../react/icons.js";

export function MemoLine({ memo }: { memo: string }) {
  const text = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(false);
  const [open, setOpen] = useState(false);

  // Layout, not effect: this reads scrollHeight, and doing it after paint would
  // show one frame of a row without its hint.
  useLayoutEffect(() => {
    const el = text.current;
    if (!el) return;
    setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [memo, open]);

  return (
    <div
      className={`hmemo${clamped ? " clamped" : ""}${open ? " open" : ""}`}
      title={clamped ? t(open ? "memo.collapse" : "memo.expand") : undefined}
      onClick={() => {
        // Let a click that was really a text selection stand.
        if (window.getSelection()?.toString()) return;
        if (!clamped) return;
        setOpen((was) => !was);
      }}
    >
      <span className="memo-mark" aria-hidden="true">
        <NoteIcon />
      </span>
      <p className="hmemo-text" ref={text}>
        {memo}
      </p>
    </div>
  );
}
