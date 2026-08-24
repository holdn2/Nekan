import test from "node:test";
import assert from "node:assert/strict";

import {
  auditMergeConfig,
  auditStyles,
  circularThemeKeys,
  classesIn,
  definitionsBySheet,
  emittedUtilities,
  mergeScales,
  themeNames,
} from "#tools/check-styles.js";

const sheet = (name: string, css: string) => ({ name, css });

test("class names come from selectors, not from declaration values", () => {
  // Every one of these would be a false positive for a regex over the whole
  // file: a class name inside content:, inside a url(), and inside a comment.
  const css = `
    /* .commented-out { display: none } */
    .real { content: ".fake"; background: url("a.b/.png") }
    .also-real, .third > .fourth:hover { color: red }
  `;
  assert.deepEqual([...classesIn(css)].sort(), [
    "also-real",
    "fourth",
    "real",
    "third",
  ]);
});

test("selectors inside @media and @layer are still selectors", () => {
  const css = `
    @media (prefers-reduced-motion: reduce) { .motion { transition: none } }
    @layer nekan { .layered { color: red } }
    @font-face { font-family: "X"; src: url(".x") }
  `;
  assert.deepEqual([...classesIn(css)].sort(), ["layered", "motion"]);
});

test("a class only asked about in :not() or :has() is not a definition", () => {
  // welcome.css has `body:has(#welcome:not(.hidden)) #minBtn`, which styles a
  // window button and says nothing about .hidden. Counting it made one sheet
  // look like it owned a name it only looks for.
  assert.deepEqual(
    [...classesIn("body:has(#w:not(.hidden)) .win-btn { z-index: 1 }")].sort(),
    ["win-btn"],
  );
  // :is() and :where() are the other way round -- those really are styled.
  assert.deepEqual([...classesIn(":is(.a, .b) { color: red }")].sort(), [
    "a",
    "b",
  ]);
});

test("a class defined in two sheets is reported with both of them", () => {
  const where = definitionsBySheet([
    sheet("a.css", ".shared { color: red } .only-a {}"),
    sheet("b.css", ".shared { color: blue }"),
  ]);
  assert.deepEqual(where.get("shared"), ["a.css", "b.css"]);
  assert.deepEqual(where.get("only-a"), ["a.css"]);
});

test("the ratchet fails when a duplicate is added and passes at the line", () => {
  const sheets = [
    sheet("a.css", ".one {} .two {}"),
    sheet("b.css", ".one {} .two {}"),
  ];
  assert.equal(auditStyles({ sheets, max: 2 }).errors.length, 0);

  const over = auditStyles({ sheets, max: 1 });
  assert.equal(over.errors.length, 1);
  assert.match(over.errors[0], /defined in more than one sheet/);
});

test("dropping below the line asks for the line to be lowered", () => {
  const r = auditStyles({ sheets: [sheet("a.css", ".one {}")], max: 3 });
  assert.equal(r.errors.length, 0);
  assert.equal(r.slack, 3);
});

test("a @theme key the sheets also read by name is circular", () => {
  // This is the bug that shipped square corners in a build that passed
  // everything else: Tailwind sees var(--radius-sm) in the sheets, decides its
  // own --radius-sm is in use, and emits --radius-sm: var(--radius-sm).
  const entry = `@theme inline {\n  --color-panel: var(--panel);\n  --radius-sm: var(--radius-sm);\n}`;
  const sheets =
    ".card { background: var(--panel); border-radius: var(--radius-sm) }";
  assert.deepEqual(circularThemeKeys(entry, sheets), ["--radius-sm"]);
});

test("a @theme key nothing reads by that name is fine", () => {
  // --color-panel is safe precisely because the sheets say var(--panel).
  const entry = `@theme inline {\n  --color-panel: var(--panel);\n}`;
  assert.deepEqual(
    circularThemeKeys(entry, ".card { background: var(--panel) }"),
    [],
  );
});

test("no @theme block at all is not an error", () => {
  assert.deepEqual(
    circularThemeKeys("/* nothing here */", ".a { color: red }"),
    [],
  );
});

test("utilities are read from the build, and are none before one exists", () => {
  assert.equal(emittedUtilities("").size, 0);
  assert.equal(emittedUtilities("@layer nekan{.a{color:red}}").size, 0);

  const built =
    "@layer nekan{.a{color:red}}@layer utilities{.hidden{display:none}.flex{display:flex}}";
  assert.deepEqual([...emittedUtilities(built)].sort(), ["flex", "hidden"]);
});

test("a utility that shares a name with a sheet's class is an error", () => {
  // The utility lands in a later layer, so it wins however specific the
  // sheet's rule is -- which is how `.toast.hidden` would lose its animation.
  const r = auditStyles({
    sheets: [sheet("toast.css", ".toast.hidden { opacity: 0 }")],
    builtCss: "@layer utilities{.hidden{display:none}}",
  });
  assert.equal(r.shadowed.length, 1);
  assert.match(r.errors[0], /\.hidden is both a generated utility/);
});

test("no utilities emitted means nothing to shadow", () => {
  const r = auditStyles({
    sheets: [sheet("toast.css", ".toast.hidden { opacity: 0 }")],
    builtCss: "@layer nekan{.toast{display:flex}}",
  });
  assert.deepEqual(r.shadowed, []);
  assert.equal(r.errors.length, 0);
});

const THEME = [
  "@theme inline {",
  "  --color-panel: var(--panel);",
  "  --text-xs: var(--fs-xs);",
  "  --text-md: var(--fs-md);",
  "}",
  "",
  "@theme static {",
  "  --radius-pill: 999px;",
  "}",
].join("\n");

/** A cn.ts whose scales agree with THEME, so a case can bend one of them. */
const inSync = (over: Record<string, string[]> = {}) =>
  Object.entries({
    COLORS: ["panel"],
    TEXT: ["xs", "md"],
    RADIUS: ["pill"],
    SPACING: [],
    SHADOW: [],
    FONT_WEIGHT: [],
    LEADING: [],
    TRACKING: [],
    ...over,
  })
    .map(([k, v]) => `export const ${k} = ${JSON.stringify(v)};`)
    .join("\n");

test("theme keys are read out of every @theme block, inline or static", () => {
  // The palette is in an `inline` block and the corners are in a `static` one,
  // so reading only the first would miss half the theme.
  assert.deepEqual(themeNames(THEME, "color-"), ["panel"]);
  assert.deepEqual(themeNames(THEME, "text-"), ["md", "xs"]);
  assert.deepEqual(themeNames(THEME, "radius-"), ["pill"]);
});

test("the scales tailwind-merge is given are read out of cn.ts", () => {
  const src = inSync();
  assert.deepEqual(mergeScales(src).TEXT, ["md", "xs"]);
  assert.deepEqual(mergeScales(src).COLORS, ["panel"]);
});

test("a scale that has drifted from the theme is named, in both directions", () => {
  const missing = auditMergeConfig(THEME, inSync({ TEXT: ["xs"] }));
  assert.ok(missing.some((e) => /TEXT/.test(e) && /missing md/.test(e)));

  const extra = auditMergeConfig(THEME, inSync({ TEXT: ["xs", "md", "huge"] }));
  assert.ok(extra.some((e) => /TEXT/.test(e) && /huge/.test(e)));
});

test("a scale cn.ts stopped exporting is an error, not a silent pass", () => {
  // The failure this guards: rename the export, the check finds nothing to
  // compare, and quietly approves whatever the merge is configured with.
  const errors = auditMergeConfig(THEME, "export const SOMETHING_ELSE = [];");
  assert.ok(errors.some((e) => /no longer exports TEXT/.test(e)));
});

test("matching scales are silent", () => {
  assert.deepEqual(auditMergeConfig(THEME, inSync()), []);
});
