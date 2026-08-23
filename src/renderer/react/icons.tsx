/**
 * Icons, for the React half.
 *
 * components/icons.ts builds the same shapes as DOM nodes, for the parts of
 * the renderer that are still hand-built. The numbers live there and are
 * imported here, so the two versions cannot drift; when the last hand-built
 * caller is gone, that module becomes this one.
 *
 * Size and stroke are decided here rather than by the caller, and the colour is
 * currentColor so a theme, a hover and a disabled state all reach the icon
 * without a second palette. The accessible name belongs to the button, not to
 * the drawing -- hence aria-hidden.
 */

import { CLOSE, NOTE } from "../components/icons.js";

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
