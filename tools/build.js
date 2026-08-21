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
const OUT = path.join(ROOT, "out");
const PROJECTS = ["tsconfig.main.json", "tsconfig.renderer.json"];

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
  return files.length;
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
      const rel = path.relative(OUT, full);
      const from = path.join(SRC, rel);
      // A .js in out/ comes from a .js or a .ts of the same name.
      const source =
        fs.existsSync(from) ||
        (rel.endsWith(".js") && fs.existsSync(from.replace(/\.js$/, ".ts")));
      if (!source) {
        fs.rmSync(full);
        gone += 1;
      }
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
