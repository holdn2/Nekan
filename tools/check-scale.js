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

function main() {
  let scale;
  try {
    scale = require(path.join(ROOT, "out", "shared", "theme.js"));
  } catch {
    console.log("check-scale: out/shared/theme.js is not built yet, skipping");
    return 0;
  }

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

  if (problems.length) {
    console.error("check-scale: the desktop and the shared scale disagree\n");
    for (const p of problems) console.error(`  ${p}`);
    console.error(
      "\nFix src/shared/theme.ts, or the stylesheet, so both say the same thing.",
    );
    return 1;
  }
  console.log(`check-scale: ${checked} size tokens match the shared scale`);
  return 0;
}

process.exit(main());
