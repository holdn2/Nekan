/**
 * The inline icons.
 *
 * Drawn from Lucide rather than by hand now (2026-08-26), but the same rules
 * as before still hold: size and stroke are decided here rather than by the
 * caller, every icon strokes with currentColor so a theme, a hover and an
 * overdue chip's red all reach it without a second palette, and the
 * accessible name belongs to the button, not to the drawing -- hence
 * aria-hidden on every one (Lucide already defaults it, but it is passed
 * explicitly so that stays true even if the library's default changes).
 *
 * Lucide draws on a 24-unit viewBox at strokeWidth 2. The hand-drawn icons it
 * replaced sat on a 16-unit viewBox at 1.3-1.6. Effective stroke is
 * `strokeWidth * renderedSize / viewBox`, and the rendered size cancels out
 * of the ratio between the two viewBoxes, so matching optical weight is just
 * `strokeWidth * 24/16` = `strokeWidth * 1.5` regardless of what size the
 * icon renders at. Each icon below carries its own arithmetic.
 */

import { Calendar, ChevronRight, FileText, Plus, X } from "lucide-react";

import { cn } from "./cn.js";

/**
 * The cross: the delete mark on a task row, and the memo panel's close button.
 *
 * Was hand-drawn rather than typed as "x" because that glyph sits 1.36px
 * below the middle of its button -- it centres on the font's maths axis, not
 * its box. Lucide's X is two lines crossing at (12, 12), the centre of its
 * viewBox, so it is centred by construction the same way the old paths were.
 */
export function CloseIcon() {
  // Was strokeWidth 1.5 on a 16 viewBox (effective 1.5*10/16 = 0.9375px at
  // this render size). 1.5 * 1.5 = 2.25 lands on the same effective stroke.
  return <X size={10} strokeWidth={2.25} aria-hidden="true" />;
}

/** The plus on every add button, for the same reason as the cross. */
export function PlusIcon() {
  // Was 1.5 on 16 (effective 1.5*12/16 = 1.125px). 1.5 * 1.5 = 2.25.
  return <Plus size={12} strokeWidth={2.25} aria-hidden="true" />;
}

/** The "this task has a memo" marker, on matrix rows and archive rows alike. */
export function NoteIcon() {
  // Was 1.3 on 16 (effective 1.3*11/16 = 0.89375px). 1.3 * 1.5 = 1.95.
  return <FileText size={11} strokeWidth={1.95} aria-hidden="true" />;
}

/** The face of an empty due chip -- the click target that opens the picker. */
export function CalendarIcon() {
  // Was 1.3 on 16 (effective 1.3*12/16 = 0.975px). 1.3 * 1.5 = 1.95.
  return <Calendar size={12} strokeWidth={1.95} aria-hidden="true" />;
}

/**
 * The brain dump's fold/unfold arrow. Rotated rather than redrawn.
 *
 * Points right when folded, down when open -- the only moving part of the
 * header, so it carries the whole open/closed signal. Which way it points is
 * the `open` prop and a rotate utility now; inbox.css used to decide it from a
 * class on the <section>, and stopped when the fold moved into React.
 */
export function ChevronIcon({ open }: { open?: boolean }) {
  // Was 1.6 on 16 (effective 1.6*11/16 = 1.1px). 1.6 * 1.5 = 2.4.
  return (
    <ChevronRight
      className={cn(
        "chev flex-none text-faint transition-transform duration-[150ms]",
        "group-hover:text-accent",
        open && "rotate-90",
      )}
      size={11}
      strokeWidth={2.4}
      aria-hidden="true"
    />
  );
}
