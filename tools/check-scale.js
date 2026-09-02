#!/usr/bin/env node
/**
 * The desktop's size tokens against the shared scale.
 *
 * `src/shared/theme.ts` is where a size is decided now, the way it is already
 * where a colour is decided. The desktop cannot simply import it: the numbers
 * have to be CSS custom properties for the stylesheets and the utilities to
 * reach them, and the block they live in cannot be generated -- the radius
 * steps sit in `@theme static` to dodge Tailwind's self-reference trap, and
 * moving them would bring it back (see the note on that block in index.css).
 *
 * So the numbers stay written twice and this makes the second copy honest. It
 * reads the stylesheets rather than the build output, because these survive
 * into the bundle unchanged and reading the source says which file to fix.
 *
 * Adding a step: put it in theme.ts and in the stylesheet, and this passes.
 * Changing one and forgetting the other is the failure it exists to catch.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const STYLES = path.join(ROOT, "src", "renderer", "styles");

/** Which CSS prefix each scale is spelled with, and which sheet holds it. */
const GROUPS = [
  { name: "SPACING", prefix: "--sp-", file: "base.css" },
  { name: "FONT_SIZE", prefix: "--fs-", file: "base.css" },
  { name: "FONT_WEIGHT", prefix: "--fw-", file: "base.css", unitless: true },
  { name: "LINE_HEIGHT", prefix: "--lh-", file: "base.css", unitless: true },
  { name: "RADIUS", prefix: "--radius-", file: "index.css" },
];

/**
 * Every `--prefix-name: value` in a sheet, as a map of name to value.
 *
 * Read line by line rather than with a pattern: the values here are plain and
 * the escaping a regex would need is one more thing to get wrong.
 */
function tokens(file, prefix) {
  const css = fs.readFileSync(path.join(STYLES, file), "utf8");
  const found = {};
  for (const raw of css.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith(prefix)) continue;
    const colon = line.indexOf(":");
    const semi = line.indexOf(";", colon);
    if (colon === -1 || semi === -1) continue;
    found[line.slice(prefix.length, colon)] = line
      .slice(colon + 1, semi)
      .trim();
  }
  return found;
}

/**
 * The phone, which has no cascade and so writes numbers into style objects.
 *
 * The desktop cannot spell a size off the scale -- `text-15px` and `p-4` do
 * not compile, deliberately. React Native has no such gate: `fontSize: 15` is
 * valid and silently outside the system, which is exactly how the two screens
 * drifted the first time. So the gate is here instead.
 *
 * Only the two properties that carry a scale step. Widths and heights are
 * measurements of specific things, not steps, and naming them would be
 * pretending.
 */
const PHONE_PROPS = ["fontSize", "borderRadius"];

/**
 * Whitespace-blind on purpose.
 *
 * A first version matched the exact string `fontSize: ` and read one line at a
 * time, which meant `fontSize:15` and a value Prettier had wrapped onto the
 * next line both walked straight past it. A gate that only holds while the
 * formatter agrees with it is not a gate -- and the whole point of this one is
 * that React Native will not complain on its own.
 */
const LITERAL = new RegExp(
  String.raw`\b(${PHONE_PROPS.join("|")})\s*:\s*-?\d`,
  "g",
);

function phoneLiterals() {
  const found = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(e.name)) continue;
      const src = fs.readFileSync(full, "utf8");
      for (const m of src.matchAll(LITERAL)) {
        const line = src.slice(0, m.index).split("\n").length;
        found.push(
          `${path.relative(ROOT, full).split(path.sep).join("/")}:${line}` +
            ` writes ${m[1]} as a number, not a step`,
        );
      }
    }
  };
  const app = path.join(ROOT, "apps", "mobile");
  if (fs.existsSync(app)) walk(app);
  return found;
}

function main() {
  // Skip only when the build has genuinely not run. A `try` around the
  // `require` itself would swallow a broken or half-written theme.js as well
  // and report success -- a checker that passes when it could not read its own
  // input is worse than no checker, because the green line says it looked.
  const theme = path.join(ROOT, "out", "shared", "theme.js");
  if (!fs.existsSync(theme)) {
    console.log("check-scale: out/shared/theme.js is not built yet, skipping");
    return 0;
  }
  const scale = require(theme);

  const problems = [];
  let checked = 0;

  for (const g of GROUPS) {
    const want = scale[g.name];
    if (!want) {
      problems.push(`${g.name} is missing from src/shared/theme.ts`);
      continue;
    }
    const got = tokens(g.file, g.prefix);
    for (const [step, value] of Object.entries(want)) {
      checked++;
      const there = got[step];
      const expect = g.unitless ? String(value) : `${value}px`;
      if (there === undefined) {
        problems.push(`${g.prefix}${step} is missing from ${g.file}`);
      } else if (there !== expect) {
        problems.push(
          `${g.prefix}${step}: ${g.file} says ${there}, theme.ts says ${expect}`,
        );
      }
    }
    for (const step of Object.keys(got)) {
      if (!(step in want)) {
        problems.push(
          `${g.prefix}${step} is in ${g.file} but not in ${g.name}`,
        );
      }
    }
  }

  const phone = phoneLiterals();
  if (phone.length) {
    console.error("check-scale: the phone writes sizes off the scale\n");
    for (const p of phone) console.error(`  ${p}`);
    console.error(
      "\nUse a named step from apps/mobile/theme.ts (SP, R, FS, FW, LH).",
    );
    return 1;
  }

  if (problems.length) {
    console.error("check-scale: the desktop and the shared scale disagree\n");
    for (const p of problems) console.error(`  ${p}`);
    console.error(
      "\nFix src/shared/theme.ts, or the stylesheet, so both say the same thing.",
    );
    return 1;
  }
  console.log(
    `check-scale: ${checked} size tokens match the shared scale,` +
      " and the phone names every step",
  );
  return 0;
}

process.exit(main());
