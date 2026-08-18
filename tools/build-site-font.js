/**
 * Build the website's copy of Pretendard.
 *
 * The app ships the whole 2MB variable font because it is read from disk. The
 * site is fetched, and its pages are a privacy policy and a deletion request --
 * the two things a store reviewer or an unhappy user opens, sometimes on a bad
 * connection. So the site gets only the glyphs it actually draws.
 *
 * The character list is read out of site/ every time rather than kept by hand:
 * a list someone has to remember to update is a list that goes stale, and a
 * missing glyph shows up as one word in a different typeface, which is easy to
 * miss. Rerun this after changing any text on the site.
 *
 *   node tools/build-site-font.js           build (and verify)
 *   node tools/build-site-font.js --check   verify only, non-zero if stale
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SOURCE = path.join(ROOT, "src/assets/fonts/PretendardVariable.woff2");
const OUT_DIR = path.join(ROOT, "site/fonts");
const OUT = path.join(OUT_DIR, "pretendard-subset.woff2");

/** Everything under site/ that can carry a word onto the screen. */
function siteFiles(dir = path.join(ROOT, "site")) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...siteFiles(full));
    else if (/\.(html|css|js|svg)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Whole files, not just the visible text.
 *
 * Stripping tags would be more precise and would also be a parser -- one that
 * has to be right about attributes, entities and comments forever. Everything
 * it would remove is ASCII, and ASCII is a rounding error in a font whose size
 * is Hangul. Over-including costs nothing and cannot be wrong.
 */
function requiredChars() {
  const chars = new Set();
  // A floor, so a small edit does not need a rebuild to look right.
  for (let c = 0x20; c <= 0x7e; c++) chars.add(String.fromCharCode(c));
  for (const c of "…–—·×→←↑↓“”‘’©®™½¼¾°±≤≥≠") chars.add(c);
  for (const file of siteFiles()) {
    for (const c of fs.readFileSync(file, "utf8")) {
      if (c !== "\n" && c !== "\r" && c !== "\t") chars.add(c);
    }
  }
  return [...chars].sort();
}

/** What the built font can actually draw, read from its cmap. */
function coveredChars(file) {
  const script = [
    "import sys",
    "from fontTools.ttLib import TTFont",
    "f = TTFont(sys.argv[1])",
    "cps = set()",
    // Codepoints, not the glyphs: this console is cp949 and printing the
    // characters themselves died on the copyright sign. Nothing here is read
    // by a person.
    "for t in f['cmap'].tables: cps.update(t.cmap.keys())",
    "sys.stdout.write(','.join(str(c) for c in sorted(cps)))",
  ].join("\n");
  const out = execFileSync("python", ["-c", script, file], {
    encoding: "utf8",
  });
  return new Set(
    out
      .trim()
      .split(",")
      .filter(Boolean)
      .map((n) => String.fromCodePoint(Number(n))),
  );
}

/**
 * Two different things look the same here and only one is a problem.
 *
 * A character the built font lacks but Pretendard has is a stale subset: rerun
 * and it is fixed. A character Pretendard does not have either -- the gear in
 * the guide text is one -- cannot be subsetted in, and the browser falls back
 * for that one glyph exactly as it does today. Failing on those would be a
 * check that can never pass.
 */
function report(wanted, built, source) {
  const stale = wanted.filter(
    (c) => c.trim() && source.has(c) && !built.has(c),
  );
  const absent = wanted.filter((c) => c.trim() && !source.has(c));

  if (absent.length) {
    console.log(
      `${absent.length} not in Pretendard at all, left to fall back: ` +
        absent.join(" "),
    );
  }
  if (!stale.length) return true;
  console.error(`${stale.length} characters are missing from the subset:`);
  console.error("  " + stale.join(" "));
  console.error("Run: node tools/build-site-font.js");
  return false;
}

const wanted = requiredChars();
const check = process.argv.includes("--check");

if (check) {
  if (!fs.existsSync(OUT)) {
    console.error("site/fonts/pretendard-subset.woff2 does not exist.");
    process.exit(1);
  }
  const built = coveredChars(OUT);
  process.exit(report(wanted, built, coveredChars(SOURCE)) ? 0 : 1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const listFile = path.join(OUT_DIR, ".chars.tmp");
fs.writeFileSync(listFile, wanted.join(""), "utf8");

try {
  // python -m rather than the pyftsubset shim: pip installs that script into a
  // Scripts directory that is not necessarily on PATH, and it was not here.
  execFileSync(
    "python",
    [
      "-m",
      "fontTools.subset",
      SOURCE,
      `--text-file=${listFile}`,
      `--output-file=${OUT}`,
      "--flavor=woff2",
      // Keep the weight axis: the site sets no weights of its own, so headings
      // and <strong> are asking the font for a bolder instance.
      "--layout-features=kern,liga,calt",
      "--drop-tables+=DSIG",
    ],
    { stdio: "inherit" },
  );
} finally {
  fs.rmSync(listFile, { force: true });
}

const before = fs.statSync(SOURCE).size;
const after = fs.statSync(OUT).size;
const built = coveredChars(OUT);

console.log(
  `${wanted.length} characters -> ${(after / 1024).toFixed(1)} KB ` +
    `(${(before / 1024 / 1024).toFixed(2)} MB full, ${((after / before) * 100).toFixed(1)}%)`,
);
if (!report(wanted, built, coveredChars(SOURCE))) process.exit(1);
console.log(
  "every character the site uses that Pretendard has is in the font.",
);
