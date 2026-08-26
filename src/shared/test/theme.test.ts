import test from "node:test";
import assert from "node:assert/strict";

import {
  RAMP,
  PALETTE,
  SHADOW,
  THEMES,
  type ColorRole,
  type ThemeName,
} from "#shared/theme.js";

/**
 * The palette's rules, as a test.
 *
 * Colours are the one part of a UI where "looks fine to me" is not a check:
 * the person who cannot read the muted grey is by definition not the person
 * choosing it. Every rule below was found by measuring rather than by looking,
 * and three of them caught real mistakes while the palette was being built --
 * `muted` at 3.64 on a white panel, an accent that failed on the window ground
 * but passed on a card, and four quadrant dots that were indistinguishable in
 * greyscale.
 *
 * The maths is here rather than in `shared/theme.ts` because the app never
 * needs it. Shipping it would be dead weight in every bundle.
 */

/* --------------------------------------------------------------- the maths */

/** One sRGB channel, 0-255, linearised. */
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Relative luminance, where white is 1. Alpha is ignored: `#rrggbbaa` is
 *  measured as if opaque, which is the right question for a tint whose
 *  backdrop is a surface this file also owns. */
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

/** WCAG contrast ratio, 1 to 21. */
function contrast(a: string, b: string): number {
  const [hi, lo] =
    luminance(a) > luminance(b)
      ? [luminance(a), luminance(b)]
      : [luminance(b), luminance(a)];
  return (hi + 0.05) / (lo + 0.05);
}

/** CIE L*, which is what "how light does this look" actually means. */
function lightness(hex: string): number {
  const y = luminance(hex);
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}

/* ---------------------------------------------------------------- the shape */

const ROLES: ColorRole[] = [
  "bg",
  "panel",
  "panel-2",
  "panel-3",
  "input-bg",
  "line",
  "line-strong",
  "text",
  "muted",
  "faint",
  "hover",
  "active",
  "disabled",
  "accent",
  "accent-soft",
  "on-accent",
  "ring",
  "danger",
  "danger-soft",
  "ok",
  "scroll",
  "scroll-hover",
  "q1",
  "q2",
  "q3",
  "q4",
];

test("every role has a value in both themes", () => {
  for (const theme of THEMES) {
    for (const role of ROLES) {
      const value = PALETTE[theme][role];
      assert.ok(value, `${theme}.${role} is missing`);
      assert.match(
        value,
        /^#[0-9a-f]{6}([0-9a-f]{2})?$/,
        `${theme}.${role} is not a lowercase hex: ${value}`,
      );
    }
  }
});

test("the two themes name exactly the same roles", () => {
  assert.deepEqual(
    Object.keys(PALETTE.light).sort(),
    Object.keys(PALETTE.dark).sort(),
  );
});

test("the four Salt and pepper colours are in the ramp, exactly", () => {
  // Anchors, not approximations. #d4d4d4 came out as #d1d1d1 while the ramp
  // was still evenly spaced, which is a different colour wearing the name.
  assert.equal(RAMP[0], "#ffffff");
  assert.equal(RAMP[3], "#d4d4d4");
  assert.equal(RAMP[5], "#b3b3b3");
  assert.equal(RAMP[13], "#2b2b2b");
});

test("the ramp only gets darker, and never repeats a step", () => {
  for (let i = 1; i < RAMP.length; i += 1) {
    assert.ok(
      lightness(RAMP[i]) < lightness(RAMP[i - 1]) - 1,
      `N${i} (${RAMP[i]}) is not at least 1 L* below N${i - 1} (${RAMP[i - 1]})`,
    );
  }
});

test("the ramp is pure grey", () => {
  // Chroma 0 is the whole premise of Salt and pepper. A tinted ramp is a
  // different decision and should have to change this line to happen.
  for (const hex of RAMP) {
    const n = Number.parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    assert.equal(r, g, `${hex} is not neutral`);
    assert.equal(g, b, `${hex} is not neutral`);
  }
});

/* -------------------------------------------------------------- the contrast */

/** [what it is, foreground role, background role, the floor it must clear] */
type Rule = [string, ColorRole, ColorRole, number];

/**
 * The pairs the UI actually forms.
 *
 * 4.5 is AA for body text, 3 is AA for graphics and large text, and the values
 * below 1.5 are not accessibility floors at all -- they are "this has to be
 * visible as a change", which is what a hover fill or a hairline is.
 */
const RULES: Rule[] = [
  ["body text on a panel", "text", "panel", 4.5],
  ["body text on the window ground", "text", "bg", 4.5],
  ["secondary text on a panel", "muted", "panel", 4.5],
  // Rows go hover on mouseover and their secondary text goes with them.
  ["secondary text on a hovered row", "muted", "hover", 4.5],
  ["de-emphasised text on a panel", "faint", "panel", 3],
  ["the accent on a panel", "accent", "panel", 4.5],
  ["the accent on the window ground", "accent", "bg", 4.5],
  ["text on the accent", "on-accent", "accent", 4.5],
  ["danger on a panel", "danger", "panel", 4.5],
  ["the sync dot on a panel", "ok", "panel", 3],
  ["a hairline against a panel", "line", "panel", 1.05],
  ["a strong border against a panel", "line-strong", "panel", 1.5],
  ["hover against a panel", "hover", "panel", 1.04],
  ["pressed against hover", "active", "hover", 1.04],
  ["a disabled control against a panel", "disabled", "panel", 2],
  ["a selected row against a panel", "accent-soft", "panel", 1.04],
  ["the q1 dot on a panel", "q1", "panel", 3],
  ["the q2 dot on a panel", "q2", "panel", 3],
  ["the q3 dot on a panel", "q3", "panel", 3],
  ["the q4 dot on a panel", "q4", "panel", 3],
];

for (const theme of THEMES) {
  test(`${theme}: every pair the UI forms clears its floor`, () => {
    for (const [what, fg, bg, floor] of RULES) {
      const got = contrast(PALETTE[theme][fg], PALETTE[theme][bg]);
      assert.ok(
        got >= floor,
        `${what}: ${PALETTE[theme][fg]} on ${PALETTE[theme][bg]} is ${got.toFixed(2)}, needs ${floor}`,
      );
    }
  });
}

const QUADS: ColorRole[] = ["q1", "q2", "q3", "q4"];

for (const theme of THEMES) {
  test(`${theme}: the four quadrant dots survive greyscale`, () => {
    // The dot is 8px and in the title bar chips it is the only thing naming a
    // quadrant, so hue alone is not enough: a red-green colour blind eye and
    // any greyscale capture see only lightness. The icon's own four sit within
    // 3.8 L* of each other, which is why these are not simply the icon's.
    const levels = QUADS.map((q) => lightness(PALETTE[theme][q]));
    for (let i = 0; i < levels.length; i += 1) {
      for (let j = i + 1; j < levels.length; j += 1) {
        const gap = Math.abs(levels[i] - levels[j]);
        assert.ok(
          gap >= 6,
          `${QUADS[i]} and ${QUADS[j]} are ${gap.toFixed(1)} L* apart, needs 6`,
        );
      }
    }
  });
}

/* --------------------------------------------------------------- elevations */

test("every elevation has a value in both themes", () => {
  for (const theme of THEMES) {
    for (const role of ["card", "knob", "even", "pop", "toast"] as const) {
      assert.ok(SHADOW[theme][role], `${theme}.${role} is missing`);
    }
  }
});

test("dark shadows are heavier than light ones", () => {
  // Not decoration: a shadow is a dark smudge and a dark ground gives it less
  // to darken, so the same alpha that reads on white disappears on #2b2b2b.
  const alphaOf = (css: string) =>
    Number.parseFloat(css.match(/\/\s*(\.\d+)/)?.[1] ?? "0");
  for (const role of ["card", "knob", "even", "pop", "toast"] as const) {
    assert.ok(
      alphaOf(SHADOW.dark[role]) > alphaOf(SHADOW.light[role]),
      `${role}: dark ${alphaOf(SHADOW.dark[role])} is not above light ${alphaOf(SHADOW.light[role])}`,
    );
  }
});

/* ------------------------------------------------------------------ the ink */

test("the accent is the ramp's own ink, not a fifth hue", () => {
  // The icon carries four colours and they are the quadrants (#49 keeps the
  // icon). An accent with a hue would put the icon and the window on different
  // systems, and would break the promise that colour on screen means something.
  const ends: Record<ThemeName, string> = {
    light: RAMP[RAMP.length - 1],
    dark: RAMP[1],
  };
  for (const theme of THEMES) {
    assert.equal(PALETTE[theme].accent, ends[theme]);
  }
});
