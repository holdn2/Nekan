/**
 * The two icons that are pictures rather than marks.
 *
 * Apart from react/icons.tsx because neither obeys its rules: Google's is a
 * brand mark whose four colours are fixed by their guidelines and must not
 * follow the theme, and the laptop stands beside it at the same size so the two
 * choices read as a pair rather than as a button and an afterthought.
 */

/** Google's own mark. The colours are theirs; do not make them currentColor. */
export function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.6 9.2c0-.6-.1-1.3-.2-1.9H9v3.5h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.3c-.8.6-1.9.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.9 10.7a5.4 5.4 0 0 1 0-3.4V5H.9a9 9 0 0 0 0 8l3-2.3z"
      />
      <path
        fill="#EA4335"
        d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z"
      />
    </svg>
  );
}

/** "on this computer" -- the other half of the first-run question. */
export function LaptopIcon() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <rect
        x="2.2"
        y="3.4"
        width="13.6"
        height="9.4"
        rx="1.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M6 15.4h6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
