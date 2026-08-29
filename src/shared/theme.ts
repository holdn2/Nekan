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
 * N03 was added later and is the reason the light end is now five deep. The
 * window ground wanted to sit below N02 and the next step down was N04, nine
 * L* away and unmistakably grey -- the ground stops being a ground and starts
 * being a colour. Everything from the old N03 on shifted by one when it went
 * in; the four anchors are still exactly where they were, which is what the
 * test asserts.
 *
 * Capping at `#2b2b2b` has one visible consequence: the dark theme is a
 * charcoal one rather than a near-black one. Softer, and of a piece with the
 * light theme rather than a separate product.
 */
export const RAMP = [
  "#ffffff", // N00  L*100    anchor
  "#f8f8f8", // N01  L* 97.5
  "#efefef", // N02  L* 94.5
  "#e9e9e9", // N03  L* 92.3
  "#d4d4d4", // N04  L* 84.9  anchor
  "#c4c4c4", // N05  L* 79
  "#b3b3b3", // N06  L* 72.9  anchor
  "#9e9e9e", // N07  L* 65
  "#898989", // N08  L* 57
  "#747474", // N09  L* 49
  "#616161", // N10  L* 41
  "#4e4e4e", // N11  L* 33
  "#3e3e3e", // N12  L* 26
  "#323232", // N13  L* 21
  "#2b2b2b", // N14  L* 17.5  anchor
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
  | "q4"
  | "q1-soft"
  | "q2-soft"
  | "q3-soft"
  | "q4-soft"
  | "q1-fill"
  | "q2-fill"
  | "q3-fill"
  | "q4-fill"
  | "on-quad"
  | "danger-fill";

/**
 * The quadrant dots.
 *
 * These used to be the app icon's own four (`build/icon.png` -- `#c85a4d`,
 * `#4a72b8`, `#c1892c`, `#8d887d` on a cream ground), with only their
 * lightness moved. They are louder than that now, on purpose: the four read as
 * variations of one muted family rather than as four categories, and the
 * fourth was a warm grey that said "disabled" rather than "least important".
 * The icon is not changing (#49), so the window and the icon are two related
 * palettes rather than one -- that is a cost, and it was taken knowingly.
 *
 * WHAT DID NOT CHANGE IS THE REASON THE OLD SET LOOKED THE WAY IT DID. The dot
 * is 8px, and in the title bar chips it is the only thing naming a quadrant.
 * Hue alone leaves the four merged for a red-green colour blind eye and in any
 * greyscale capture, so lightness is chosen per quadrant first -- 36 / 44 / 52
 * / 60 L* in light, 55 / 62 / 69 / 76 in dark -- and the hue and chroma are
 * fitted to it afterwards. Four vivid hues at one lightness are four identical
 * greys to those readers; the first attempt at this change was exactly that
 * and its L* gaps came out at 0.2.
 *
 * Measured, both themes: gaps of at least 6.8 L*, and every dot clears the 3:1
 * it owes its panel -- 3.17:1 worst in light against white, 3.42:1 worst in
 * dark against `#323232`. Those bounds are what caps the light set's lightness
 * and floors the dark set's.
 *
 * The fourth hue is violet because it is the one left: `--ok` has green and
 * `--danger` has red, and this app's promise is that colour means something.
 */
const QUAD = {
  light: { q1: "#c33020", q2: "#1a50ae", q3: "#cb8010", q4: "#9c60d1" },
  dark: { q1: "#e67468", q2: "#4982e4", q3: "#f1af4d", q4: "#c099e1" },
} as const;

/**
 * The same four as a wash, for the quadrant headers.
 *
 * Alpha over the panel rather than a pre-mixed hex, the way `danger-soft`
 * already works: one value per quadrant instead of one per quadrant per
 * surface, and it stays right if the panel beneath it ever moves. Dark carries
 * more of it because a light hue laid on charcoal disappears faster than a
 * dark hue laid on white -- 10% reads on `#ffffff` and does not on `#323232`.
 *
 * This is a wash and not a fill on purpose: the header still has to carry
 * `--text` at full contrast and, in quadrant 1, the red overflow count. A
 * header dark enough to take white lettering would bury that warning, which
 * is the one thing on that row the app actually needs read.
 */
const QUAD_SOFT = {
  light: { q1: "#c330201a", q2: "#1a50ae1a", q3: "#cb80101a", q4: "#9c60d11a" },
  dark: { q1: "#e6746824", q2: "#4982e424", q3: "#f1af4d24", q4: "#c099e124" },
} as const;

/**
 * The same four again, solid, for the one place a quadrant colour is filled
 * and lettered on: the count.
 *
 * The lettering is near-white in BOTH themes (`on-quad`), which is what forces
 * these values. `on-accent` would have been the reusable one, but it flips to
 * ink in dark, and a count that is dark in one theme and light in the other
 * reads as two different chips. Holding the lettering still means the fill has
 * to move instead: every one of these clears 4.5:1 against it -- measured 5.58
 * / 7.49 / 4.52 / 4.67 light, 4.68 / 4.63 / 4.64 / 4.64 dark.
 *
 * In light that costs almost nothing: the dots are already dark, and only `q3`
 * and `q4` are nudged. In dark it costs the pop -- the dot's own colour is a
 * light one, so a fill that takes white lettering has to be darkened until it
 * sits close to the panel behind it (2.6:1 rather than 4.8:1). The number stays
 * perfectly readable; the pill around it is quieter. That was the trade asked
 * for and it is worth writing down, because the obvious "fix" later would be to
 * brighten these back and silently break the lettering.
 *
 * The hue does not move, only the lightness, so the chip still reads as the
 * quadrant it belongs to. The dot keeps `QUAD` -- its job is the L* spacing
 * described above, and it carries no text.
 */
const QUAD_FILL = {
  light: { q1: "#c33020", q2: "#1a50ae", q3: "#a6690d", q4: "#935ac4" },
  dark: { q1: "#ac574e", q2: "#3e6fc3", q3: "#91692e", q4: "#806696" },
} as const;

const quadSurfaces = (t: ThemeName) => ({
  "q1-soft": QUAD_SOFT[t].q1,
  "q2-soft": QUAD_SOFT[t].q2,
  "q3-soft": QUAD_SOFT[t].q3,
  "q4-soft": QUAD_SOFT[t].q4,
  "q1-fill": QUAD_FILL[t].q1,
  "q2-fill": QUAD_FILL[t].q2,
  "q3-fill": QUAD_FILL[t].q3,
  "q4-fill": QUAD_FILL[t].q4,
  "on-quad": t === "light" ? N(0) : N(1),
  "danger-fill": t === "light" ? "#a8302a" : "#99625c",
});

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
    // A step further from the panel than it used to be. At N(1) the ground and
    // a card were 1.04:1 apart, which is not a difference so much as a rounding
    // error -- panels read as part of the window and the shadow under them had
    // nothing to fall onto. N(2) is the smallest move the ramp offers and takes
    // that to 1.11:1.
    bg: N(3),
    panel: N(0),
    "panel-2": N(2),
    "panel-3": N(4),
    "input-bg": N(0),
    line: N(2),
    "line-strong": N(5),
    text: N(14),
    muted: N(10),
    faint: N(8),
    hover: N(1),
    active: N(2),
    disabled: N(6),
    accent: N(14),
    "accent-soft": N(2),
    "on-accent": N(0),
    ring: `${N(14)}40`,
    danger: "#a8302a",
    "danger-soft": "#a8302a1a",
    ok: "#3f7d5a",
    scroll: N(5),
    "scroll-hover": N(7),
    ...QUAD.light,
    ...quadSurfaces("light"),
  },
  dark: {
    bg: N(14),
    panel: N(13),
    "panel-2": N(12),
    "panel-3": N(11),
    "input-bg": N(14),
    line: N(12),
    "line-strong": N(11),
    text: N(1),
    muted: N(6),
    faint: N(8),
    hover: N(12),
    active: N(11),
    disabled: N(9),
    accent: N(1),
    "accent-soft": N(12),
    "on-accent": N(14),
    ring: `${N(1)}40`,
    // Not the light danger lifted a little: red has to stay red on a charcoal
    // panel and still clear 4.5:1 against it.
    danger: "#e9968c",
    "danger-soft": "#e9968c1f",
    ok: "#68c195",
    scroll: N(11),
    "scroll-hover": N(10),
    ...QUAD.dark,
    ...quadSurfaces("dark"),
  },
};

export type ShadowRole = "card" | "raise" | "knob" | "even" | "pop" | "toast";

/**
 * Six elevations, both themes.
 *
 * Five of them predate the dark theme, and only one followed it -- the other
 * four were light-theme values sitting on a dark window. The names are kept:
 * each already had a job.
 *
 * `raise` is the sixth, and it is what the four boards and the dump sit on. It
 * is directionless for the same reason `even` is, arrived at from the other
 * end: with an offset shadow the four boards each cast down and to the right,
 * which reads as one light source in the corner of a grid rather than as four
 * of the same thing side by side. It is also deliberately between `card` and
 * where it started -- the first pass at it was twice this and looked like four
 * floating cards, which is the look this whole design is trying not to have.
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
    raise: "0 0 2px rgb(0 0 0 / 0.05), 0 0 10px rgb(0 0 0 / 0.05)",
    knob: "0 1px 2px rgb(0 0 0 / 0.12)",
    even: "0 0 3px rgb(0 0 0 / 0.18)",
    pop: "0 10px 30px rgb(0 0 0 / 0.12), 0 2px 6px rgb(0 0 0 / 0.07)",
    toast: "0 8px 24px rgb(0 0 0 / 0.16)",
  },
  dark: {
    card: "0 1px 2px rgb(0 0 0 / 0.35)",
    raise: "0 0 2px rgb(0 0 0 / 0.32), 0 0 12px rgb(0 0 0 / 0.24)",
    knob: "0 1px 2px rgb(0 0 0 / 0.45)",
    even: "0 0 3px rgb(0 0 0 / 0.5)",
    pop: "0 12px 34px rgb(0 0 0 / 0.55), 0 2px 6px rgb(0 0 0 / 0.4)",
    toast: "0 8px 24px rgb(0 0 0 / 0.5)",
  },
};

export const THEMES: readonly ThemeName[] = ["light", "dark"];
