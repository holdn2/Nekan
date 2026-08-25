/**
 * Run electron-builder, and decide in one place where its output goes.
 *
 * That last part is the whole reason this file exists. On this machine
 * something outside the project holds handles on the .asar files under
 * D:\_Nekan\dist -- Defender's real-time scan is the likeliest candidate -- and
 * electron-builder empties <output>/win-unpacked before it unpacks Electron
 * into it (app-builder-lib/out/electron/ElectronFramework.js, emptyDir on
 * appOutDir). So a build dies with
 *
 *   EBUSY: resource busy or locked, unlink ...\dist\win-unpacked\resources\app.asar
 *
 * The directory cannot be deleted or even renamed. It is not one of our
 * processes: nothing runs from that path. Building anywhere outside the
 * repository works on the first try, every time.
 *
 * Setting NEKAN_DIST moves the output, and this file hands the answer to both
 * electron-builder and the release check. Those two have to agree about where
 * the files are: the check re-uploads assets from disk when a draft splits, and
 * it can only do that if it is looking where the build wrote. check-release.js
 * reads the variable too, so that running it by hand in a shell that has it
 * exported still works -- but on the path through here it is passed as an
 * argument, which wins, so there is one answer per run.
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

/**
 * Run a Node program as a child, without a shell.
 *
 * `shell: true` is what tools/build.js uses to reach npx, and it is fine there
 * because every argument it passes is a literal written in that file. Here one
 * argument is a path out of the environment, and a shell would parse it again:
 * `C:/Program Files/nekan dist` arrives as three arguments, and anything after
 * an `&` runs as a separate command. Measured, not assumed.
 *
 * Resolving the bin from the package rather than going through npx is what lets
 * the shell go. npx is a .cmd on Windows and Node refuses to spawn one without
 * a shell; a .js file is just a file, and process.execPath is already Node.
 */
function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  // A signal leaves status null. Exiting 0 there would report a killed build as
  // a finished one.
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/** Where electron-builder's own bin lives, asked of the package itself. */
function builderCli() {
  const manifest = require.resolve("electron-builder/package.json");
  return path.join(
    path.dirname(manifest),
    require(manifest).bin["electron-builder"],
  );
}

/**
 * Read the two flags this script takes, and refuse anything else.
 *
 * `args.includes("--publish")` on its own is a trap. npm appends everything
 * after `--` to the script, so `npm run dist -- --publish never` -- which is
 * what the old package.json literally said, and therefore what is in muscle
 * memory and in the git history -- would set publish to true and upload for
 * real. The word meaning "definitely do not" would cause the thing.
 *
 * Refusing unknown arguments also stops them being silently dropped. Nothing
 * here is forwarded to electron-builder, so `-- --dir` or `-- --arm64` used to
 * look like it did something and did not.
 */
function parseArgs(argv) {
  const known = new Set(["--mac", "--publish"]);
  const unknown = argv.filter((arg) => !known.has(arg));
  if (unknown.length > 0) {
    throw new Error(
      [
        `unknown argument: ${unknown.join(" ")}`,
        `  This takes --mac and --publish, and nothing else reaches`,
        `  electron-builder. "--publish never" reads as --publish and would`,
        `  upload, which is why an unknown argument is an error, not a guess.`,
      ].join("\n"),
    );
  }
  return { mac: argv.includes("--mac"), publish: argv.includes("--publish") };
}

function main() {
  let mac, publish;
  try {
    ({ mac, publish } = parseArgs(process.argv.slice(2)));
  } catch (e) {
    // The message is the point; a stack trace would bury it.
    console.error(e.message);
    process.exit(2);
  }
  const out = outputDir();

  if (out !== (pkg.build?.directories?.output ?? "dist")) {
    console.log(`packaging into ${out} (NEKAN_DIST)`);
  }

  run(builderCli(), [
    ...(mac ? ["--mac"] : ["--win", "nsis"]),
    "--publish",
    publish ? "always" : "never",
    `-c.directories.output=${out}`,
  ]);

  // Only after a real upload is there a draft to put back together. The check
  // is told where the files are rather than assuming, for the reason in the
  // header.
  if (!publish) return;
  run(path.join(__dirname, "check-release.js"), [out]);
}

module.exports = { outputDir, builderCli, parseArgs };

if (require.main === module) main();
