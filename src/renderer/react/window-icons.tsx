/**
 * The five buttons at the right-hand end of the title bar, plus the update
 * arrow that joins them when there is one.
 *
 * Apart from react/icons.tsx because these are window furniture rather than
 * task marks: they are all 14px against that file's 10-12, and they are drawn
 * once each rather than per row.
 */

/** A new version is downloaded and waiting. Only ever shown when it is. */
export function UpdateIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle
        cx="8"
        cy="8"
        r="6.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M8 11.4V5M5.4 7.6L8 5l2.6 2.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * A cog, not a circle with spokes: that reads as the sun icon the theme button
 * used to be, right next to where it used to sit. The outline is generated
 * rather than drawn by hand, so all eight teeth are identical and evenly
 * spaced.
 */
export function CogIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M6.67 3.28L6.87 1.19L9.13 1.19L9.33 3.28L10.39 3.72L12.01 2.39L13.61 3.99L12.28 5.61L12.72 6.67L14.81 6.87L14.81 9.13L12.72 9.33L12.28 10.39L13.61 12.01L12.01 13.61L10.39 12.28L9.33 12.72L9.13 14.81L6.87 14.81L6.67 12.72L5.61 12.28L3.99 13.61L2.39 12.01L3.72 10.39L3.28 9.33L1.19 9.13L1.19 6.87L3.28 6.67L3.72 5.61L2.39 3.99L3.99 2.39L5.61 3.72Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <circle
        cx="8"
        cy="8"
        r="2.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      />
    </svg>
  );
}

/** Always on top. Filled rather than stroked, so "on" reads at a glance. */
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
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect
        x="2"
        y="3"
        width="12"
        height="10"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M2 6h12" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function MinimiseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M3 8h10" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/** Quit. Bigger and thinner than the row-delete cross, which is 10px. */
export function QuitIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
