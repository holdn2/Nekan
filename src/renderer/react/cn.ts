/**
 * Build a className out of parts, where the last one wins.
 *
 * Utility lists get long and most have a conditional in the middle, which as a
 * template literal means counting spaces by eye -- a missing one welds two
 * class names into a third that matches nothing and looks almost right.
 *
 * The other half is conflict resolution, and it is the half that makes this
 * worth having rather than a `filter(Boolean).join(" ")`. Two utilities that
 * set the same property are decided by the order Tailwind emitted them in, not
 * by the order they appear in the attribute -- so `cn("p-md", "p-lg")` without
 * a merge is a coin toss. With one it is `p-lg`, which is what anyone writing
 * it meant, and it is what lets a component take a `className` prop and have
 * the caller actually override something.
 *
 * ## The scales below are not decoration
 *
 * tailwind-merge decides which group a class belongs to from its own knowledge
 * of Tailwind's default scales, and this app does not use those -- it uses the
 * tokens in `styles/index.css`, with `--spacing` deliberately left undefined so
 * that `p-4` does not exist and `p-md` does.
 *
 * Left unconfigured it gets `text-*` wrong, which is the ambiguous one:
 * `text-sm` is a font size and `text-danger` is a colour, and it tells them
 * apart by asking whether the suffix is a known size. `md` is not a size in
 * default Tailwind, so `text-md` would be filed as a colour -- and then
 * `cn("text-md", "text-muted")` would drop the size instead of the colour,
 * silently, in the one direction nothing would catch.
 *
 * The lists therefore have to match the theme, and a copy of a list is a thing
 * that drifts. `tools/check-styles.js` reads `styles/index.css` and this file
 * and fails if they ever disagree, so this is checked rather than remembered --
 * and `npm test` is what runs it. `cn.test.tsx` asserts behaviour, not drift.
 */

import { extendTailwindMerge } from "tailwind-merge";

/** Colour tokens, from `@theme inline` in styles/index.css. */
export const COLORS = [
  "transparent",
  "current",
  "bg",
  "panel",
  "panel-2",
  "panel-3",
  "line",
  "line-strong",
  "text",
  "muted",
  "faint",
  "input-bg",
  "accent",
  "accent-soft",
  "on-accent",
  "ring",
  "danger",
  "danger-soft",
  "ok",
  // The four interaction states. Before these there was no `hover` at all --
  // eleven call sites reached for `panel-3`, which is a surface, so tuning a
  // hover moved a panel with it.
  "hover",
  "active",
  "disabled",
  "scroll",
  "scroll-hover",
  "q1",
  "q2",
  "q3",
  "q4",
];

/** Named spacing steps. There is no numeric scale on purpose. */
export const SPACING = [
  "hair",
  "2xs",
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
  "5xl",
  "6xl",
  "7xl",
];

/** Font sizes. `md` is the one default Tailwind does not have. */
export const TEXT = ["xs", "sm", "md", "lg", "xl", "2xl", "3xl"];

export const RADIUS = ["xs", "sm", "md", "panel", "lg", "pill"];
export const SHADOW = ["default", "knob", "even", "pop", "toast"];
export const FONT_WEIGHT = ["light", "normal", "medium", "semibold"];
export const LEADING = ["none", "snug", "normal", "relaxed"];
export const TRACKING = ["tight", "wide"];

const twMerge = extendTailwindMerge({
  override: {
    theme: {
      color: COLORS,
      spacing: SPACING,
      text: TEXT,
      radius: RADIUS,
      shadow: SHADOW,
      font: ["sans"],
      "font-weight": FONT_WEIGHT,
      leading: LEADING,
      tracking: TRACKING,
    },
  },
});

export function cn(...parts: Array<string | false | null | undefined>): string {
  const joined: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    for (const name of part.split(/\s+/)) if (name) joined.push(name);
  }
  return twMerge(joined.join(" "));
}
