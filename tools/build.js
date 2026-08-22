/**
 * Build `src/` into `out/`.
 *
 * There are two compilers rather than one because the two halves of the app
 * load differently: the main process and the sandboxed preload are CommonJS,
 * the renderer is ES modules the browser reads with the specifiers written
 * exactly as they appear. One tsconfig cannot say both.
 *
 * Everything that is not code is copied. `out/` has to be a complete app on
 * its own -- index.html, the fifteen stylesheets whose <link> order is the
 * cascade, the bundled font, the icons -- because that is what package.json's
 * `main` points at and what electron-builder ships.
 *
 * The migration to TypeScript runs file by file, so `src` is a mix for as long
 * as it takes. `allowJs` carries the files not converted yet straight through,
 * which is what keeps `out/` runnable at every commit instead of only at the
 * end of the conversion.
 */

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src");
const TEST = path.join(ROOT, "test");
const OUT = path.join(ROOT, "out");
const PROJECTS = [
  "tsconfig.shared.json",
  "tsconfig.main.json",
  "tsconfig.renderer.json",
  "tsconfig.test.json",
];

/** Copied as-is. Anything the compilers do not emit has to be in this list. */
const ASSET_EXT = new Set([
  ".html",
  ".css",
  ".json",
  ".woff2",
  ".ico",
  ".png",
  ".txt",
]);

/** Every file under src/ that the compilers will not produce. */
function assets(dir = SRC) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...assets(full));
    else if (ASSET_EXT.has(path.extname(entry.name))) found.push(full);
  }
  return found;
}

/** Copy one file, making its directory first. Same relative path under out/. */
function copyAsset(file) {
  const target = path.join(OUT, path.relative(SRC, file));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(file, target);
}

function copyAssets() {
  const files = assets();
  files.forEach(copyAsset);
  markSharedAsEsm();
  return files.length;
}

/**
 * Tell Node that out/shared/ is ES modules and the rest of out/ is not.
 *
 * The renderer needs shared/ as browser modules; the main process and the test
 * runner reach the same files through require(), which Node has been able to
 * do for an ES module since 22.12. What it cannot do is guess the format, and
 * the repo's own package.json has no "type", so a bare .js under out/ is
 * CommonJS. The nearest parent package.json wins, so one line in this one
 * directory splits the two without renaming anything to .mjs -- which would
 * have been the other way, and would have made the browser's MIME lookup the
 * next thing to go wrong.
 */
function markSharedAsEsm() {
  const dir = path.join(OUT, "shared");
  if (!fs.existsSync(dir)) return;
  fs.writeFileSync(
    path.join(dir, "package.json"),
    `${JSON.stringify({ type: "module" }, null, 2)}
`,
  );
}

/**
 * Is there still something behind this file in out/?
 *
 * Three kinds of thing live there and only one of them comes from src/:
 * out/test/ is compiled from test/, and the compilers' own bookkeeping --
 * declarations and .tsbuildinfo -- comes from nowhere at all. Getting this
 * wrong is not loud: an over-eager sweep just deletes the incremental cache
 * and the .d.ts files that the project references read, and every build
 * silently becomes a full one.
 */
function hasSource(rel) {
  // Written by the compilers, for the compilers.
  if (rel.startsWith(".tsbuildinfo")) return true;
  // Written by markSharedAsEsm below.
  if (rel === "shared/package.json") return true;

  const fromTest = rel.startsWith("test/");
  const root = fromTest ? TEST : SRC;
  const sub = fromTest ? rel.slice("test/".length) : rel;
  // A .js or a .d.ts in out/ was produced by the .ts or .js of the same name;
  // anything else was copied verbatim and keeps its name.
  const stem = sub.replace(/\.d\.ts$/, "").replace(/\.js$/, "");
  return (
    fs.existsSync(path.join(root, sub)) ||
    fs.existsSync(path.join(root, `${stem}.ts`)) ||
    fs.existsSync(path.join(root, `${stem}.js`))
  );
}

/**
 * Delete anything in out/ with no source behind it.
 *
 * Without this a renamed or deleted file keeps running: the stale output stays
 * on disk and index.html or a require() goes on finding it. That is a failure
 * mode with no error message, which is the expensive kind.
 */
function prune() {
  if (!fs.existsSync(OUT)) return 0;
  let gone = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
        continue;
      }
      const rel = path.relative(OUT, full).split(path.sep).join("/");
      if (hasSource(rel)) continue;
      fs.rmSync(full);
      gone += 1;
    }
  };
  walk(OUT);
  return gone;
}

function compile(watch) {
  for (const project of PROJECTS) {
    const args = ["tsc", "-p", project, ...(watch ? ["--watch"] : [])];
    if (watch) {
      spawn("npx", args, { cwd: ROOT, stdio: "inherit", shell: true });
      continue;
    }
    const run = spawnSync("npx", args, {
      cwd: ROOT,
      stdio: "inherit",
      shell: true,
    });
    if (run.status !== 0) process.exit(run.status ?? 1);
  }
}

const watch = process.argv.includes("--watch");
const removed = prune();
compile(watch);

if (watch) {
  copyAssets();
  // Recursive watching is a Windows and macOS feature; on Linux this falls
  // back to the one directory, which is enough for a dev loop nobody runs
  // there. The whole set is re-copied rather than the one file resolved,
  // because an editor's save is often a rename and the event names the
  // temporary.
  fs.watch(SRC, { recursive: true }, (_event, file) => {
    if (file && ASSET_EXT.has(path.extname(file))) copyAssets();
  });
  console.log("watching src/ for assets");
} else {
  const copied = copyAssets();
  console.log(
    `built out/ (${copied} assets copied${removed ? `, ${removed} stale removed` : ""})`,
  );
}
