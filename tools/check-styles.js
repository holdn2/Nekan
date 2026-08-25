/**
 * Hold the line on the two things the Tailwind migration can break quietly.
 *
 * #75 exists because 170 class names are spread over sixteen stylesheets and
 * 33 of them were defined in more than one file. `hidden` was in nine. That is
 * the number the migration is supposed to move, and a number nobody watches
 * moves the wrong way -- so this ratchets it: adding a duplicate fails the
 * build, removing one asks you to lower the line.
 *
 * The other two checks are for traps that were found by measurement while the
 * plumbing went in, both of which pass every other check in this repository:
 *
 *   - A `@theme inline` key spelled the same as a custom property the sheets
 *     read makes Tailwind emit `--x: var(--x)` into `:root` outside every
 *     layer, where it beats the real value and resolves to nothing.
 *   - Once utilities are generated, any of them sharing a name with a class
 *     the sheets define wins on layer order, no matter how specific the
 *     sheet's rule is.
 *
 * Runs after the build, because the third check reads what Tailwind actually
 * emitted rather than guessing what it would.
 */

const fs = require("fs");
const path = require("path");

const STYLES = path.join(__dirname, "..", "src", "renderer", "styles");
const BUILT = path.join(__dirname, "..", "out", "renderer", "assets");

/**
 * How many duplicated class names are allowed. This is a ratchet, not a
 * target: every component that moves to utilities should take a bite out of it,
 * and the number only ever goes down. 33 the day the plumbing landed; 32 once
 * `hidden` stopped being nine per-area rules and became one utility; 30 with the tab strip; 28 once the
 * dot and the ghost button became components; 22 when archive.css went away
 * entirely; 15 with the memo panel and the matrix; 10 once the guide, the due
 * chip and the settings/account/welcome cluster went in parallel; 5 with the
 * title bar, which was the last sheet.
 */
const MAX_DUPLICATED = 5;

/**
 * And how many definitions those names add up to. The count above is of names,
 * so a name already defined twice could be defined a third time for free --
 * `.item` lives in matrix.css and memo.css, and adding it to a third sheet, a
 * brand new cross-sheet override and the exact thing this file exists to stop,
 * left the number at 10 and passed. Found by making the check fail rather than
 * by reading it. 20 with the three parallel chunks in, 10 with the title bar.
 */
const MAX_DUPLICATE_DEFS = 10;

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** At-rules that hold style rules rather than declarations. */
const GROUPING = /^@(media|supports|layer|container|scope|document)\b/;

/**
 * Drop the arguments of `:not()` and `:has()` from a selector.
 *
 * A class in there is a condition, not something being styled:
 * `body:has(#welcome:not(.hidden)) #minBtn` styles a window button, and says
 * nothing about `.hidden` or `#welcome`. Counting those as definitions makes a
 * sheet look like it owns a name it only asks about -- which is the difference
 * between "nine sheets define .hidden" and "one sheet looks for it".
 *
 * `:is()` and `:where()` are deliberately left alone: their arguments really do
 * get styled.
 */
function withoutConditions(selector) {
  let out = "";
  let i = 0;
  while (i < selector.length) {
    const rest = selector.slice(i);
    const m = /^:(not|has)\(/.exec(rest);
    if (!m) {
      out += selector[i];
      i++;
      continue;
    }
    let depth = 1;
    let j = i + m[0].length;
    while (j < selector.length && depth > 0) {
      if (selector[j] === "(") depth++;
      else if (selector[j] === ")") depth--;
      j++;
    }
    i = j;
  }
  return out;
}

/**
 * Every class name a stylesheet defines.
 *
 * Walks rather than regexes the whole file, because a regex over the text also
 * finds class names inside declaration values -- `content: ".foo"` and every
 * url() with a dot in it -- and those are not definitions.
 */
function classesIn(css) {
  const src = stripComments(css);
  const found = new Set();
  let i = 0;
  let prelude = "";

  const take = (selector) => {
    for (const m of withoutConditions(selector).matchAll(
      /\.(-?[_a-zA-Z][\w-]*)/g,
    )) {
      found.add(m[1]);
    }
  };

  const walk = () => {
    while (i < src.length) {
      const c = src[i];
      if (c === "{") {
        const head = prelude.trim();
        prelude = "";
        i++;
        if (GROUPING.test(head)) {
          walk(); // its children are style rules too
        } else {
          if (!head.startsWith("@")) take(head);
          let depth = 1;
          while (i < src.length && depth > 0) {
            if (src[i] === "{") depth++;
            else if (src[i] === "}") depth--;
            i++;
          }
        }
      } else if (c === "}") {
        i++;
        prelude = "";
        return;
      } else {
        prelude += c;
        i++;
      }
    }
  };

  walk();
  return found;
}

/** Which file defines what, for every sheet handed in as {name, css}. */
function definitionsBySheet(sheets) {
  const where = new Map();
  for (const { name, css } of sheets) {
    for (const cls of classesIn(css)) {
      if (!where.has(cls)) where.set(cls, []);
      where.get(cls).push(name);
    }
  }
  return where;
}

/**
 * The `@theme inline` keys that would come back out as a self-reference.
 *
 * A key is safe when no stylesheet reads a custom property of that exact name.
 * `--color-panel` is safe because the sheets say `var(--panel)`; `--radius-sm`
 * is not, because they say `var(--radius-sm)` and Tailwind reads that as "my
 * theme variable is in use" and emits it.
 */
function circularThemeKeys(entryCss, sheetsCss) {
  // Every `inline` block, and only the `inline` ones. Looking at just the
  // first `@theme` was right by accident of block order: put `@theme static`
  // first and it calls that block's keys circular, which they are not --
  // static emits the literal, not a self-reference -- and a second inline
  // block after a static one goes unseen entirely.
  const keys = [
    ...stripComments(entryCss).matchAll(/@theme([^{]*)\{([\s\S]*?)\n\}/g),
  ]
    .filter((m) => /\binline\b/.test(m[1]))
    .flatMap((m) =>
      [...m[2].matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((k) => k[1]),
    );
  if (!keys.length) return [];
  const read = new Set(
    [...stripComments(sheetsCss).matchAll(/var\(\s*(--[\w-]+)/g)].map(
      (m) => m[1],
    ),
  );
  return keys.filter((k) => read.has(k));
}

/**
 * Utility class names Tailwind actually put in the build, if any.
 *
 * Reading the output rather than predicting it means this check turns itself
 * on the day `source(none)` comes off, and stays right about what it is
 * checking against without anyone maintaining a list.
 */
function emittedUtilities(builtCss) {
  // Matched rather than indexed: minified output is `@layer utilities{`, but a
  // build with cssMinify off writes `@layer utilities {`, and a literal lookup
  // then finds nothing -- which reads as "nothing to shadow" rather than as
  // "this check did not run".
  const head = builtCss.match(/@layer\s+utilities\s*\{/);
  if (!head) return new Set();
  let depth = 1;
  let j = head.index + head[0].length;
  const start = j;
  while (j < builtCss.length && depth > 0) {
    if (builtCss[j] === "{") depth++;
    else if (builtCss[j] === "}") {
      depth--;
      if (!depth) break;
    }
    j++;
  }
  const body = builtCss.slice(start, j);
  const names = new Set();
  for (const m of body.matchAll(/\.((?:\\.|[-\w])+)[{,: ]/g)) {
    names.add(m[1].replace(/\\/g, ""));
  }
  return names;
}

/**
 * The theme keys in a namespace, e.g. `--color-panel` -> `panel`.
 *
 * Reads every `@theme` block, so it does not care that the palette is in an
 * `inline` one and the corners are in a `static` one.
 */
function themeNames(entryCss, prefix) {
  const found = new Set();
  for (const block of stripComments(entryCss).matchAll(
    /@theme[^{]*\{([\s\S]*?)^\}/gm,
  )) {
    for (const m of block[1].matchAll(/^\s*--([\w-]+)\s*:/gm)) {
      if (m[1].startsWith(prefix)) found.add(m[1].slice(prefix.length));
    }
  }
  return [...found].sort();
}

/**
 * The scale lists `renderer/react/cn.ts` hands to tailwind-merge.
 *
 * Read out of the source rather than imported: this runs as plain CommonJS
 * before anything is built, and the built renderer is a bundle with no module
 * to import from anyway.
 */
function mergeScales(cnSource) {
  const out = {};
  for (const m of cnSource.matchAll(
    /export const ([A-Z_]+)(?:\s*:[^=]+)?\s*=\s*\[([\s\S]*?)\];/g,
  )) {
    out[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map((q) => q[1]).sort();
  }
  return out;
}

/**
 * Does tailwind-merge know the same scales the stylesheet declares?
 *
 * It decides which utilities conflict from its own idea of Tailwind's default
 * scales, and this app uses none of them. `text-*` is the one that bites:
 * `text-sm` is a size and `text-danger` is a colour, told apart by whether the
 * suffix is a known size. `md` is not one in default Tailwind, so an
 * unconfigured merge files `text-md` as a colour and then drops the size when
 * both are present -- silently, and in the direction nothing else would catch.
 *
 * So cn.ts carries a copy of the scales, and a copy is a thing that drifts.
 */
function auditMergeConfig(entryCss, cnSource) {
  const scales = mergeScales(cnSource);
  const PAIRS = [
    ["COLORS", "color-"],
    ["SPACING", "spacing-"],
    ["TEXT", "text-"],
    ["RADIUS", "radius-"],
    ["SHADOW", "shadow-"],
    ["FONT_WEIGHT", "font-weight-"],
    ["LEADING", "leading-"],
    ["TRACKING", "tracking-"],
  ];
  const errors = [];
  for (const [name, prefix] of PAIRS) {
    const declared = scales[name];
    if (!declared) {
      errors.push(
        `cn.ts no longer exports ${name}, so its scale cannot be checked`,
      );
      continue;
    }
    const inCss = themeNames(entryCss, prefix);
    const missing = inCss.filter((v) => !declared.includes(v));
    const extra = declared.filter((v) => !inCss.includes(v));
    if (missing.length || extra.length) {
      errors.push(
        `cn.ts ${name} does not match the ${prefix}* theme keys` +
          (missing.length ? ` -- missing ${missing.join(", ")}` : "") +
          (extra.length
            ? ` -- has ${extra.join(", ")} which the theme does not`
            : ""),
      );
    }
  }
  return errors;
}

/**
 * Judge a set of stylesheets. Pure, so the tests can hand it cases this
 * repository does not have yet.
 */
function auditStyles({
  sheets,
  entryCss = "",
  builtCss = "",
  cnSource = "",
  max = MAX_DUPLICATED,
  maxDefs = MAX_DUPLICATE_DEFS,
}) {
  const where = definitionsBySheet(sheets);
  const duplicated = [...where.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([cls, files]) => ({ cls, files: files.slice().sort() }))
    .sort(
      (a, b) => b.files.length - a.files.length || a.cls.localeCompare(b.cls),
    );

  const circular = circularThemeKeys(
    entryCss,
    sheets.map((s) => s.css).join("\n"),
  );

  const utilities = emittedUtilities(builtCss);
  const shadowed = [...where.keys()].filter((c) => utilities.has(c)).sort();

  const errors = [];
  const defs = duplicated.reduce((n, d) => n + d.files.length, 0);
  if (duplicated.length > max) {
    errors.push(
      `${duplicated.length} class names are defined in more than one sheet, and the line is ${max}`,
    );
  }
  if (defs > maxDefs) {
    errors.push(
      `those names add up to ${defs} definitions, and the line is ${maxDefs} -- widening a name that is already duplicated counts`,
    );
  }
  for (const key of circular) {
    errors.push(
      `@theme key ${key} is also read as var(${key}) by a stylesheet -- Tailwind will emit ${key}: var(${key}) into :root, outside every layer, and it will resolve to nothing`,
    );
  }
  if (cnSource) errors.push(...auditMergeConfig(entryCss, cnSource));

  for (const cls of shadowed) {
    errors.push(
      `.${cls} is both a generated utility and a class defined in ${where.get(cls).join(", ")} -- the utility is in a later layer, so it wins however specific the sheet's rule is`,
    );
  }

  return {
    classes: where.size,
    duplicated,
    circular,
    shadowed,
    utilities: utilities.size,
    errors,
    defs,
    /** Set when either count dropped, so the ratchet can be tightened. */
    slack: max - duplicated.length,
    defsSlack: maxDefs - defs,
  };
}

module.exports = {
  MAX_DUPLICATED,
  MAX_DUPLICATE_DEFS,
  themeNames,
  mergeScales,
  auditMergeConfig,
  classesIn,
  definitionsBySheet,
  circularThemeKeys,
  emittedUtilities,
  auditStyles,
};

if (require.main === module) {
  const sheets = fs
    .readdirSync(STYLES)
    .filter((f) => f.endsWith(".css") && f !== "index.css")
    .sort()
    .map((name) => ({
      name,
      css: fs.readFileSync(path.join(STYLES, name), "utf8"),
    }));

  const entryCss = fs.readFileSync(path.join(STYLES, "index.css"), "utf8");

  // The built CSS is optional on purpose: this should still say something
  // useful before a build, it just cannot check the utilities yet.
  let builtCss = "";
  if (fs.existsSync(BUILT)) {
    for (const f of fs.readdirSync(BUILT).filter((f) => f.endsWith(".css"))) {
      builtCss += fs.readFileSync(path.join(BUILT, f), "utf8");
    }
  }

  const cnSource = fs.readFileSync(
    path.join(__dirname, "..", "src", "renderer", "react", "cn.ts"),
    "utf8",
  );

  const r = auditStyles({ sheets, entryCss, builtCss, cnSource });

  console.log(`check-styles: ${sheets.length} sheets, ${r.classes} classes`);
  console.log(
    `  defined in more than one sheet: ${r.duplicated.length} (line: ${MAX_DUPLICATED})`,
  );
  console.log(
    `  those names, counted per sheet: ${r.defs} (line: ${MAX_DUPLICATE_DEFS})`,
  );
  for (const { cls, files } of r.duplicated.slice(0, 8)) {
    console.log(`    ${cls} -- ${files.join(", ")}`);
  }
  if (r.duplicated.length > 8) {
    console.log(`    ... and ${r.duplicated.length - 8} more`);
  }
  console.log(
    builtCss
      ? `  utilities generated: ${r.utilities}`
      : `  utilities generated: not built yet, so not checked`,
  );

  if (r.errors.length) {
    console.error("");
    for (const e of r.errors) console.error(`check-styles: ${e}`);
    process.exit(1);
  }

  if (r.slack > 0) {
    console.log(
      `\nok -- and ${r.slack} fewer than the line. Lower MAX_DUPLICATED to ${r.duplicated.length} so it cannot come back.`,
    );
  } else {
    console.log("\nok");
  }
}
