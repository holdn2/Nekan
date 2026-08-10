/**
 * Every Korean string still baked into the source, by file.
 *
 * The progress meter for the i18n extraction, and the only honest way to say it
 * is finished. Roughly half of index.html's Korean lives in `title` and
 * `aria-label`, which never show on screen -- reviewing by eye leaves those
 * behind and the app looks fully translated while a screen reader still speaks
 * Korean. A count does not care whether a string is visible.
 *
 *   node tools/find-untranslated.js          # per-file counts
 *   node tools/find-untranslated.js --list   # every hit, with line numbers
 *
 * Comments are skipped: this repo writes them in English, except in index.html
 * where they are Korean and are not shipped to anybody. The catalogues are
 * skipped too, for the obvious reason.
 *
 * Stylesheets are scanned as well, and that is not belt-and-braces: a CSS
 * `content:` string is a word on screen that no catalogue can reach. The
 * "Recommended" badge on the first-run card was exactly that, and this tool
 * reported zero while the badge sat there in Korean under an English UI.
 *
 * Only whole-line `//` comments are stripped, not trailing ones -- a Korean
 * comment after code counts as a hit. That is deliberate. Stripping every `//`
 * would eat the one inside `https://` in a string, and a real lexical scanner
 * is a lot of machinery for a progress meter. The failure direction is the safe
 * one: it over-reports work left, never under-reports it.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "src");
const HANGUL = /[ㄱ-ㆎ가-힣]/;
const SKIP = new Set(["i18n"]);

/** Blank out comments so their Korean does not count as work left to do. */
function stripComments(text, ext) {
  if (ext === ".html") return text.replace(/<!--[\s\S]*?-->/g, blank);
  const blocks = text.replace(/\/\*[\s\S]*?\*\//g, blank);
  // CSS has no `//` comment. Blanking those lines there would hide a real
  // declaration -- and hiding one is the only way this tool can lie, which is
  // the whole thing it exists not to do.
  if (ext === ".css") return blocks;
  return blocks.replace(/^\s*\/\/.*$/gm, "");
}

/** Keep the line count identical so reported line numbers stay true. */
function blank(match) {
  return match.replace(/[^\n]/g, " ");
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) walk(full, out);
    } else if (/\.(js|html|css)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const list = process.argv.includes("--list");
let total = 0;
const rows = [];

for (const file of walk(ROOT)) {
  const ext = path.extname(file);
  const lines = stripComments(fs.readFileSync(file, "utf8"), ext).split("\n");
  const hits = [];
  lines.forEach((line, i) => {
    if (HANGUL.test(line)) hits.push({ n: i + 1, text: line.trim() });
  });
  if (!hits.length) continue;
  total += hits.length;
  rows.push({ file: path.relative(ROOT, file), hits });
}

rows.sort((a, b) => b.hits.length - a.hits.length);
for (const row of rows) {
  console.log(`${String(row.hits.length).padStart(4)}  ${row.file}`);
  if (list) {
    for (const hit of row.hits) {
      console.log(
        `      ${String(hit.n).padStart(4)}: ${hit.text.slice(0, 100)}`,
      );
    }
  }
}
console.log(`\n${total} lines with Korean, in ${rows.length} files`);
