/**
 * The inline icons.
 *
 * Drawn here rather than written into index.html because most of them ride on
 * elements created per task. For a while there were two of each -- a DOM
 * builder for the hand-built renderer and a component for React -- sharing one
 * set of numbers so the two could not drift. The last hand-built caller is
 * gone, so this is the only version now.
 *
 * Size and stroke are decided here rather than by the caller, and every shape
 * strokes with currentColor so a theme, a hover and an overdue chip's red all
 * reach the icon without a second palette. The accessible name belongs to the
 * button, not to the drawing -- hence aria-hidden throughout.
 */

/**
 * The cross: the delete mark on a task row, and the memo panel's close button.
 *
 * Drawn rather than typed. As the × character it sat 1.36px below the middle of
 * its button, because that glyph centres on the font's maths axis and not on
 * its box — invisible until hover paints a square behind it, and then plainly
 * off. The fix was a padding tuned by measurement, which is a number that
 * quietly stops being right the moment the font or the size changes. Two lines
 * crossing at the centre of the viewBox are centred by construction.
 */
const CLOSE = { size: 10, d: "M4.5 4.5l7 7M11.5 4.5l-7 7", strokeWidth: 1.5 };

/** The plus on every add button, for the same reason as the cross. */
const PLUS = { size: 12, d: "M8 3.5v9M3.5 8h9", strokeWidth: 1.5 };

/** The "this task has a memo" marker, on matrix rows and archive rows alike. */
const NOTE = {
  size: 11,
  page: "M3.4 2.2h9.2v11.6H3.4z",
  lines: "M5.6 5.4h4.8M5.6 8h4.8M5.6 10.6h3",
  strokeWidth: 1.3,
};

/** The face of an empty due chip -- the click target that opens the picker. */
const CALENDAR = {
  size: 12,
  box: { x: "2.2", y: "3.4", width: "11.6", height: "10.4", rx: "1.6" },
  rings: "M2.2 6.6h11.6M5.6 2v2.6M10.4 2v2.6",
  strokeWidth: 1.3,
};

export function CloseIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width={CLOSE.size}
      height={CLOSE.size}
      aria-hidden="true"
    >
      <path
        d={CLOSE.d}
        stroke="currentColor"
        strokeWidth={CLOSE.strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width={PLUS.size}
      height={PLUS.size}
      aria-hidden="true"
    >
      <path
        d={PLUS.d}
        stroke="currentColor"
        strokeWidth={PLUS.strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function NoteIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width={NOTE.size}
      height={NOTE.size}
      aria-hidden="true"
    >
      <path
        d={NOTE.page}
        fill="none"
        stroke="currentColor"
        strokeWidth={NOTE.strokeWidth}
        strokeLinejoin="round"
      />
      <path
        d={NOTE.lines}
        stroke="currentColor"
        strokeWidth={NOTE.strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width={CALENDAR.size}
      height={CALENDAR.size}
      aria-hidden="true"
    >
      <rect
        {...CALENDAR.box}
        fill="none"
        stroke="currentColor"
        strokeWidth={CALENDAR.strokeWidth}
      />
      <path
        d={CALENDAR.rings}
        stroke="currentColor"
        strokeWidth={CALENDAR.strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The brain dump's fold/unfold arrow. Rotated by CSS, not redrawn. */
export function ChevronIcon() {
  return (
    <svg
      className="chev"
      viewBox="0 0 16 16"
      width="11"
      height="11"
      aria-hidden="true"
    >
      <path
        d="M6 3.5L10.5 8L6 12.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
