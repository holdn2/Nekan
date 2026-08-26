/**
 * The palette, and the only place its values exist.
 *
 * Two layers, and the split is the whole point.
 *
 *   RAMP     fourteen greys. The only literal colours in the neutral system.
 *   PALETTE  what the app names. Each theme picks ramp steps for each role.
 *
 * A role can share a value with another and still be its own name. `hover` and
 * `bg` are both `N(1)` today, and that is fine: what matters is that moving
 * hover later does not drag the window ground along with it. Before this file
 * there was no `hover` at all -- eleven call sites reached for `panel-3`, which
 * is a surface, so tuning the hover meant moving a panel.
 *
 * It lives in `shared/` because four consumers need the same answer: the
 * renderer, the export document (`shared/export.ts` renders in a hidden window
 * and cannot see `renderer/styles/`), the website, and whatever mobile turns
 * out to be. The site copied these values by hand until #91 and drifted in
 * seven of them; this is how that stops happening.
 *
 * Nothing here touches the DOM or Node -- `tsconfig.shared.json` enforces that
 * -- so it is data, and `tools/build-theme.js` turns it into CSS.
 */

/**
 * Salt and pepper, extended.
 *
 * The four colours of the reference palette are anchors and appear exactly:
 * `#ffffff` (N00), `#d4d4d4` (N03), `#b3b3b3` (N05), `#2b2b2b` (N13). The rest
 * fill in around them.
 *
 * The steps are not evenly spaced and should not be. A UI does not spend greys
 * evenly: four surfaces and two borders crowd the light end, three carry text
 * in the middle, and the dark theme has to build *upward* from `#2b2b2b`,
 * because that is the floor and there is nothing below it to layer against. An
 * L*-even ramp put N02 at `#dbdbdb`, far too dark for a window ground.
 *
 * Capping at `#2b2b2b` has one visible consequence: the dark theme is a
 * charcoal one rather than a near-black one. Softer, and of a piece with the
 * light theme rather than a separate product.
 */
export const RAMP = [
  "#ffffff", // N00  L*100    anchor
  "#f8f8f8", // N01  L* 97.5
  "#efefef", // N02  L* 94.5
  "#d4d4d4", // N03  L* 84.9  anchor
  "#c4c4c4", // N04  L* 79
  "#b3b3b3", // N05  L* 72.9  anchor
  "#9e9e9e", // N06  L* 65
  "#898989", // N07  L* 57
  "#747474", // N08  L* 49
  "#616161", // N09  L* 41
  "#4e4e4e", // N10  L* 33
  "#3e3e3e", // N11  L* 26
  "#323232", // N12  L* 21
  "#2b2b2b", // N13  L* 17.5  anchor
] as const;

const N = (step: number): string => RAMP[step];

export type ThemeName = "light" | "dark";

/**
 * Every colour the app names. Adding one here is the only way to add a colour:
 * a hex written anywhere else is a value with no theme and no test.
 */
export type ColorRole =
  | "bg"
  | "panel"
  | "panel-2"
  | "panel-3"
  | "input-bg"
  | "line"
  | "line-strong"
  | "text"
  | "muted"
  | "faint"
  | "hover"
  | "active"
  | "disabled"
  | "accent"
  | "accent-soft"
  | "on-accent"
  | "ring"
  | "danger"
  | "danger-soft"
  | "ok"
  | "scroll"
  | "scroll-hover"
  | "q1"
  | "q2"
  | "q3"
  | "q4";

/**
 * The quadrant dots, and why they are not simply the icon's four colours.
 *
 * `build/icon.png` *is* the quadrant palette -- `#c85a4d`, `#4a72b8`,
 * `#c1892c`, `#8d887d` on a cream ground -- so the hues and saturations here
 * are the icon's, unchanged. What moved is lightness.
 *
 * The dot is 8px, and in the title bar chips it is the only thing naming a
 * quadrant. Hue alone leaves the four merged for a red-green colour blind eye
 * and in any greyscale capture: the icon's own four sit within 3.8 L* of each
 * other. Pushed apart they clear 7 L*, which greyscale still separates, while
 * staying recognisably the same colours.
 *
 * The light set is bounded above by the 3:1 a dot owes a white panel (about
 * L*62) and the dark set is bounded below by the same rule against a `#323232`
 * panel (about L*53).
 */
const QUAD = {
  light: { q1: "#b24437", q2: "#36558a", q3: "#bd862b", q4: "#807b71" },
  dark: { q1: "#d47e74", q2: "#6284c1", q3: "#dfb570", q4: "#aca8a1" },
} as const;

/**
 * The accent is ink: the ramp's own darkest in light, its lightest in dark.
 *
 * The app icon already carries four colours, and they are the quadrants. A
 * fifth hue would put the icon and the window on different systems for good,
 * since the icon is not changing (#49). Ink also keeps a promise nothing else
 * can: if there is colour on screen, it means something -- a quadrant, or a
 * deadline that has passed.
 *
 * An ink accent has to be *used* differently, though. `accent-soft` is a ramp
 * step rather than a wash of the accent, because a neutral tint is not a tint,
 * it is a smudge. Where a hue would tint, ink fills: a solid `#2b2b2b` with
 * white on it, a 2px bar, a ring with weight.
 */
export const PALETTE: Record<ThemeName, Record<ColorRole, string>> = {
  light: {
    bg: N(1),
    panel: N(0),
    "panel-2": N(2),
    "panel-3": N(3),
    "input-bg": N(0),
    line: N(2),
    "line-strong": N(4),
    text: N(13),
    muted: N(9),
    faint: N(7),
    hover: N(1),
    active: N(2),
    disabled: N(5),
    accent: N(13),
    "accent-soft": N(2),
    "on-accent": N(0),
    ring: `${N(13)}40`,
    danger: "#a8302a",
    "danger-soft": "#a8302a1a",
    ok: "#3f7d5a",
    scroll: N(4),
    "scroll-hover": N(6),
    ...QUAD.light,
  },
  dark: {
    bg: N(13),
    panel: N(12),
    "panel-2": N(11),
    "panel-3": N(10),
    "input-bg": N(13),
    line: N(11),
    "line-strong": N(10),
    text: N(1),
    muted: N(5),
    faint: N(7),
    hover: N(11),
    active: N(10),
    disabled: N(8),
    accent: N(1),
    "accent-soft": N(11),
    "on-accent": N(13),
    ring: `${N(1)}40`,
    // Not the light danger lifted a little: red has to stay red on a charcoal
    // panel and still clear 4.5:1 against it.
    danger: "#e9968c",
    "danger-soft": "#e9968c1f",
    ok: "#68c195",
    scroll: N(10),
    "scroll-hover": N(9),
    ...QUAD.dark,
  },
};

export type ShadowRole = "card" | "knob" | "even" | "pop" | "toast";

/**
 * Five elevations, both themes.
 *
 * There were five before too, and only one of them followed the theme -- the
 * other four were light-theme values sitting on a dark window. The names are
 * kept: each of the five already had a job.
 *
 * `even` is the odd one and stays because its job is real. It is directionless,
 * for something sitting in a gap too tight to fall into: an offset shadow fills
 * the space below and leaves the space above clean, and the thing then reads as
 * riding high even when it is centred to the pixel. The switch's pill is the
 * only user, and its track is nine levels of luminance away, so that edge is
 * most of what separates them.
 *
 * The alphas carry a leading zero because the repository's formatter wants one --
 * and no trailing zero either -- in the CSS this becomes, and the generated file has to be already-formatted
 * or every build undoes `prettier --write`.
 *
 * The dark values are far heavier and still do less work, which is not a
 * contradiction: a shadow is a dark smudge, and on a dark ground there is
 * little left to darken. Dark separates by lifting the surface a ramp step and
 * drawing a visible edge; its shadows only really register under a popover or
 * a toast, where there is depth to suggest.
 */
export const SHADOW: Record<ThemeName, Record<ShadowRole, string>> = {
  light: {
    card: "0 1px 2px rgb(0 0 0 / 0.05)",
    knob: "0 1px 2px rgb(0 0 0 / 0.12)",
    even: "0 0 3px rgb(0 0 0 / 0.18)",
    pop: "0 10px 30px rgb(0 0 0 / 0.12), 0 2px 6px rgb(0 0 0 / 0.07)",
    toast: "0 8px 24px rgb(0 0 0 / 0.16)",
  },
  dark: {
    card: "0 1px 2px rgb(0 0 0 / 0.35)",
    knob: "0 1px 2px rgb(0 0 0 / 0.45)",
    even: "0 0 3px rgb(0 0 0 / 0.5)",
    pop: "0 12px 34px rgb(0 0 0 / 0.55), 0 2px 6px rgb(0 0 0 / 0.4)",
    toast: "0 8px 24px rgb(0 0 0 / 0.5)",
  },
};

export const THEMES: readonly ThemeName[] = ["light", "dark"];
