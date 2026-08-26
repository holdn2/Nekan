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
const { writeTheme, writeSite } = require("./build-theme.js");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src");
const OUT = path.join(ROOT, "out");
const RENDERER = path.join(SRC, "renderer");
const PROJECTS = [
  "tsconfig.shared.json",
  "tsconfig.main.json",
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

/**
 * Every file under src/ that neither compiler nor bundler will produce.
 *
 * src/renderer/ is skipped whole: Vite reads index.html, follows the fifteen
 * <link>s and the entry script, and writes the lot into out/renderer itself.
 * Copying the sources next to the bundle would leave a second, stale copy of
 * every stylesheet one directory away from the one actually being used.
 */
function assets(dir = SRC) {
  if (dir === RENDERER) return [];
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...assets(full));
    // The font is Vite's to emit -- it is referenced from base.css, so the
    // bundler already carries it across, and a second copy here would be two
    // megabytes of the same file in the installer.
    else if (path.extname(entry.name) === ".woff2") continue;
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
 * Three kinds of thing live there and only one of them comes from src/ at the
 * same path: out/test/ mirrors src/ under a directory of its own, and the
 * compilers' own bookkeeping -- declarations and .tsbuildinfo -- comes from
 * nowhere at all. Getting this
 * wrong is not loud: an over-eager sweep just deletes the incremental cache
 * and the .d.ts files that the project references read, and every build
 * silently becomes a full one.
 */
function hasSource(rel, produced) {
  // Written by the compilers, for the compilers.
  if (rel.startsWith(".tsbuildinfo")) return true;
  // Vite's, all of it. Hashed filenames have no source of the same name, and
  // emptyOutDir already clears the directory on every build.
  if (rel.startsWith("renderer/")) return true;
  // Written by markSharedAsEsm below.
  if (rel === "shared/package.json") return true;

  // Copied assets are pruned against what this build actually copies. Asking
  // "is there a file of that name in src/" instead would keep a file that used
  // to be copied and no longer is -- which is the stale output this function
  // exists to remove, wearing the face of a source file.
  if (ASSET_EXT.has(path.extname(rel))) return produced.has(rel);

  // out/test/ is the repository one level down: tsconfig.test.json has a
  // rootDir of "." and an outDir of out/test/, so out/test/src/shared/test/x.js
  // came from src/shared/test/x.ts and out/test/tools/test/y.js from
  // tools/test/y.ts. Strip the prefix and ask the repository rather than src/:
  // asking src/ looks for src/src/... and finds nothing, so prune deletes all
  // nineteen compiled tests. It is not fatal -- prune runs before the
  // compilers, so tsc writes them again -- but the test project is then rebuilt
  // in full on every build, which is the cost this function exists to avoid
  // (measured 2026-08-24: "19 stale removed" on three builds in a row).
  const inTest = rel.startsWith("test/");
  const sub = inTest ? rel.slice("test/".length) : rel;
  const root = inTest ? ROOT : SRC;
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
  const produced = new Set(
    assets().map((f) => path.relative(SRC, f).split(path.sep).join("/")),
  );
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
      if (hasSource(rel, produced)) continue;
      fs.rmSync(full);
      gone += 1;
    }
  };
  walk(OUT);
  return gone;
}

/**
 * Build the renderer. Watch mode runs Vite's own watcher rather than a second
 * process pool: it already knows the whole graph, which tsc -w would not.
 */
function bundleRenderer(watch) {
  const args = ["vite", "build", ...(watch ? ["--watch"] : [])];
  if (watch) {
    spawn("npx", args, { cwd: ROOT, stdio: "inherit", shell: true });
    return;
  }
  const run = spawnSync("npx", args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });
  if (run.status !== 0) process.exit(run.status ?? 1);
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
// Between the compilers and the bundler, because it reads out/shared/theme.js
// and writes a stylesheet Vite is about to bundle. markSharedAsEsm has to have
// run for that require() to work; it is idempotent, and copyAssets calls it
// again below.
markSharedAsEsm();
writeTheme({ quiet: watch });
writeSite({ quiet: watch });
bundleRenderer(watch);

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
