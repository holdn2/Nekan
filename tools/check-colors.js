/**
 * No colour outside the palette, except where there is a reason.
 *
 * The palette is worth having only if it is the whole answer. A single
 * `bg-[#7c43c8]` in a component is invisible in review, survives every theme
 * change, and turns "edit one file" back into "grep and hope". Tailwind's
 * arbitrary-value syntax makes writing one about as hard as not writing one,
 * which is why this is a check and not a convention.
 *
 * It already caught two: `main/window/create.ts` and `main/ipc/settings.ts`
 * carried the previous theme's `#f0eee6` and `#1f1e1d` as the window's
 * background, so the window opened in the old colours and changed as soon as
 * the renderer painted. Nothing else draws that value, so it could have sat
 * there for a long time.
 *
 * The allowance below is a ratchet, not a permission list. A file may hold as
 * many literals as it holds today and no more; a file that is not listed may
 * hold none. Removing them lowers the number, and the check says so.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
// apps/ joined when the phone did: it draws its own icons and writes its own
// styles, so it is exactly the kind of place a hex slips into and stays.
const ROOTS = ["src", "site", "apps"];
const EXT = new Set([".ts", ".tsx", ".css", ".html"]);

/** `#abc`, `#aabbcc`, `#aabbccdd`. Not `#` on its own and not a five-digit id. */
const HEX =
  /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{1}|[0-9a-fA-F]{3}|[0-9a-fA-F]{5})?\b/g;

/** Where the palette itself lives. Colours are the point of these two. */
const PALETTE_FILES = new Set([
  "src/shared/theme.ts",
  "src/renderer/styles/palette.css",
]);

/**
 * The site keeps one stylesheet on purpose -- a page a store links to should
 * render on anything -- so its palette is generated into style.css between
 * markers rather than into a file of its own. Only that region is exempt: a
 * literal written anywhere else in the sheet still counts.
 */
const GENERATED = /\/\* palette:start[\s\S]*?\/\* palette:end \*\//g;

/**
 * How many literals each file is allowed, and why it has any.
 *
 * Three kinds of reason, and only one of them is temporary.
 */
const ALLOWED = new Map([
  // Brand marks. Google publishes exact values and forbids restating them in
  // another palette, so these must not be tokenised -- ever.
  ["src/renderer/react/brand-icons.tsx", 4],
  ["src/renderer/views/account.tsx", 4],

  // There used to be a third entry here, for one literal in a comment:
  // views/account/delete-account.tsx explained that the delete button's label
  // was not `on-accent` and not #fff, because `--danger` is a deep red in
  // light and a light salmon in dark and white on salmon is barely there.
  // That button is ui/button's `destructive` variant now -- danger-coloured
  // text on a tint of itself -- so there is no light-on-dark pairing left to
  // justify and the sentence went with it. The allowance is gone rather than
  // set to 0: an allowance of 0 is the same as no entry, and an entry with no
  // reason left is the kind that gets copied.

  // The palette's own test asserts values, which means writing them down.
  ["src/shared/test/theme.test.ts", 7],
]);

// Not ours to police, and not ours to fix. src/ and site/ hold no such
// directories, so this only started mattering when apps/ arrived with a
// node_modules of its own -- reanimated alone brought thirty-two literals.
const SKIP = new Set(["node_modules", ".expo", "dist", "out"]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) walk(full, out);
    } else if (EXT.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

/** Every file with colour literals, and how many, keyed by repo-relative path. */
function scan() {
  const found = new Map();
  for (const root of ROOTS) {
    for (const file of walk(path.join(ROOT, root))) {
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      if (PALETTE_FILES.has(rel)) continue;
      const source = fs.readFileSync(file, "utf8").replace(GENERATED, "");
      const hits = source.match(HEX);
      if (hits) found.set(rel, hits.length);
    }
  }
  return found;
}

/** What the scan means: errors to fail on, and slack to report. */
function audit(found = scan(), allowed = ALLOWED) {
  const errors = [];
  const slack = [];
  for (const [file, count] of [...found].sort()) {
    const limit = allowed.get(file);
    if (limit === undefined) {
      errors.push(
        `${file} has ${count} colour ${count === 1 ? "literal" : "literals"} and no allowance. ` +
          `Use a token from src/shared/theme.ts, or add the file here with the reason.`,
      );
      continue;
    }
    if (count > limit) {
      errors.push(`${file} has ${count} colour literals, allowed ${limit}.`);
    } else if (count < limit) {
      slack.push([file, count, limit]);
    }
  }
  for (const [file, limit] of allowed) {
    if (!found.has(file)) slack.push([file, 0, limit]);
  }
  return { errors, slack, files: found.size };
}

module.exports = { scan, audit, ALLOWED, PALETTE_FILES, GENERATED, HEX };

if (require.main === module) {
  const result = audit();
  console.log(
    `check-colors: ${result.files} files hold colour literals outside the palette`,
  );
  for (const [file, count, limit] of result.slack) {
    console.log(`  ${file}: ${count} of ${limit} -- lower the allowance`);
  }
  if (result.errors.length) {
    console.error("");
    for (const e of result.errors) console.error(`check-colors: ${e}`);
    process.exit(1);
  }
  console.log("ok");
}
