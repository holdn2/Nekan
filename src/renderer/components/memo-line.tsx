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
 *
 * And when its own width changed, which is the harder half. The stylesheet
 * clamps to three lines unconditionally, so narrowing the window truncates a
 * memo that used to fit -- and a measurement taken once would leave that memo
 * cut off with no pointer, no hint, and a click that does nothing.
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
    // Only while it is clamped. Open, the stylesheet lifts the line limit and
    // the text fits by definition -- measuring then answers "no overflow" and
    // takes away the very affordance that would fold it back up. That is what
    // used to happen: an expanded memo lost its pointer, its hint and its
    // click, and the only way back was to leave the tab.
    if (open) return;
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    measure();
    // The width is not this component's to know: the window resizes, the memo
    // panel takes height, the number column widens with the row count. Watching
    // the element answers all of them at once.
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [memo, open]);

  return (
    <div
      className={`hmemo${clamped ? " clamped" : ""}${open ? " open" : ""}`}
      title={clamped ? t(open ? "memo.collapse" : "memo.expand") : undefined}
      // A button only while there is something to expand. Given a role and a
      // tab stop unconditionally, every memo on the tab would be another stop
      // on the way to the buttons that actually do something.
      role={clamped ? "button" : undefined}
      tabIndex={clamped ? 0 : undefined}
      aria-expanded={clamped ? open : undefined}
      onClick={() => {
        // Let a click that was really a text selection stand.
        if (window.getSelection()?.toString()) return;
        if (!clamped) return;
        setOpen((was) => !was);
      }}
      onKeyDown={(e) => {
        if (!clamped) return;
        // The two keys a button answers. Space would scroll the list otherwise,
        // which is why this preventDefaults rather than only acting.
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
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
