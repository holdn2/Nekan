/**
 * The five buttons at the right-hand end of the title bar, plus the update
 * arrow that joins them when there is one.
 *
 * Apart from react/icons.tsx because these are window furniture rather than
 * task marks: they are all 14px against that file's 10-12, and they are drawn
 * once each rather than per row.
 *
 * Five of the six come from Lucide now (2026-08-26); see react/icons.tsx for
 * why `strokeWidth * 1.5` keeps the same effective stroke the hand-drawn
 * 16-viewBox icons had, at any render size. PinIcon stays hand-drawn -- see
 * its own comment for why.
 */

import { ArrowUpCircle, Minus, PanelTop, Settings, X } from "lucide-react";

/** A new version is downloaded and waiting. Only ever shown when it is. */
export function UpdateIcon() {
  // Was strokeWidth 1.4 on a 16 viewBox; 1.4 * 1.5 = 2.1 keeps the same
  // effective stroke.
  return <ArrowUpCircle size={14} strokeWidth={2.1} aria-hidden="true" />;
}

/**
 * A cog, not a circle with spokes: that reads as the sun icon the theme
 * button used to be, right next to where it used to sit.
 */
export function CogIcon() {
  // Was 1.25 on 16; 1.25 * 1.5 = 1.875.
  return <Settings size={14} strokeWidth={1.875} aria-hidden="true" />;
}

/**
 * Always on top. Filled rather than stroked, so "on" reads at a glance.
 *
 * Lucide's Pin/PinOff pair was considered for the on/off read, but two things
 * rule it out here. First, the call site (title-bar.tsx) renders one
 * `<PinIcon />` unconditionally with no prop to switch on -- the on/off read
 * comes from the *button's* accent background and text colour, not from the
 * icon choosing between two drawings, and changing that call site is outside
 * this change. Second, Lucide's two pins are both plain strokes of equal
 * weight -- "on" would have nothing to read against even if the call site did
 * switch between them. A solid fill is what makes "on" legible at 14px, and
 * Lucide's Pin is not fillable as a whole: its needle ("M12 17v5") is a bare
 * open line, not part of the closed head-and-shaft outline, so filling the
 * icon with no stroke drops the needle instead of gaining a fill contrast.
 * The hand-drawn solid shape keeps both, so it stays.
 */
export function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M6 1h4l-.6 4.2 2.4 2.3v1.2H8.7V15L8 15.8 7.3 15V8.7H2.2V7.5l2.4-2.3z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Shrink to the bar -- a window with only its title row left. */
export function ShrinkIcon() {
  // Was 1.4 on 16; 1.4 * 1.5 = 2.1. PanelTop's header line sits at the same
  // relative height (9/24) as the hand-drawn one (6/16), both 0.375 down.
  return <PanelTop size={14} strokeWidth={2.1} aria-hidden="true" />;
}

export function MinimiseIcon() {
  // Was 1.4 on 16; 1.4 * 1.5 = 2.1.
  return <Minus size={14} strokeWidth={2.1} aria-hidden="true" />;
}

/** Quit. Bigger and thinner than the row-delete cross, which is 10px. */
export function QuitIcon() {
  // Was 1.5 on 16; 1.5 * 1.5 = 2.25.
  return <X size={14} strokeWidth={2.25} aria-hidden="true" />;
}
