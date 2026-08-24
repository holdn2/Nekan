/**
 * Run electron-builder, and decide in one place where its output goes.
 *
 * That last part is the whole reason this file exists. On this machine
 * something outside the project holds handles on the .asar files under
 * D:\_Nekan\dist -- Defender's real-time scan is the likeliest candidate -- and
 * electron-builder wipes its output directory before it starts. So a build
 * dies with
 *
 *   EBUSY: resource busy or locked, unlink ...\dist\win-unpacked\resources\app.asar
 *
 * The directory cannot be deleted or even renamed. It is not one of our
 * processes: nothing runs from that path. Building anywhere outside the
 * repository works on the first try, every time.
 *
 * Setting NEKAN_DIST moves the output. It is read here and nowhere else, and
 * passed on to both electron-builder and the release check -- which is the
 * point. Those two have to agree about where the files are: the check re-uploads
 * assets from disk when a draft splits, and it can only do that if it is looking
 * in the directory the build actually wrote to. Two places reading the same
 * variable is how they would eventually disagree.
 *
 *   NEKAN_DIST=/c/Users/me/AppData/Local/Temp/nekan-dist npm run release
 *
 * Unset, everything behaves exactly as it did: package.json's
 * build.directories.output, which is `dist`.
 */

const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const pkg = require(path.join(ROOT, "package.json"));

/**
 * Where the build writes.
 *
 * The fallback chain ends at package.json rather than at the string "dist", so
 * that changing build.directories.output there keeps working and this file does
 * not become a second answer to the same question.
 */
function outputDir() {
  const configured = pkg.build?.directories?.output ?? "dist";
  return process.env.NEKAN_DIST || configured;
}

function main() {
  const args = process.argv.slice(2);
  const mac = args.includes("--mac");
  const publish = args.includes("--publish");
  const out = outputDir();

  if (out !== (pkg.build?.directories?.output ?? "dist")) {
    console.log(`packaging into ${out} (NEKAN_DIST)`);
  }

  const builder = [
    "electron-builder",
    ...(mac ? ["--mac"] : ["--win", "nsis"]),
    "--publish",
    publish ? "always" : "never",
    `-c.directories.output=${out}`,
  ];
  const built = spawnSync("npx", builder, {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });
  if (built.status !== 0) process.exit(built.status ?? 1);

  // Only after a real upload is there a draft to put back together. The check
  // is told where the files are rather than assuming, for the reason in the
  // header.
  if (!publish) return;
  const checked = spawnSync(
    "node",
    [path.join("tools", "check-release.js"), out],
    {
      cwd: ROOT,
      stdio: "inherit",
      shell: true,
    },
  );
  if (checked.status !== 0) process.exit(checked.status ?? 1);
}

module.exports = { outputDir };

if (require.main === module) main();
