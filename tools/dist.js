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

const fs = require("fs");
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

/** Ask git one question, or answer null if git cannot be reached. */
function git(...args) {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

/**
 * The name this build writes beside the installers, holding the commit it came
 * from. check-release.js reads it back before it says a release may go live.
 */
const STAMP = "built-from.txt";

/**
 * Refuse to build a release from anywhere the tag will not point at.
 *
 * The mac workflow has said this since it was written -- "The release is built
 * from main, so this would upload a bundle that is not what the tag points at"
 * -- and the asymmetry was backwards: the half with the guards only fills in a
 * draft that already exists, and the half with none creates the draft and
 * makes the installer every Windows user downloads.
 *
 * A dirty tree is the same objection in a smaller shape. An installer built
 * over uncommitted edits is not any commit's: nothing in the repository, and
 * no tag, describes what a person is running.
 *
 * Only on the way to a real upload. `npm run dist` is how somebody tries a
 * package locally, and a local try is exactly when the tree is dirty.
 */
function releaseBlocker({ branch, dirty, head }) {
  // Any unanswered question is a no. `git status` failing returns null, and a
  // null read as "nothing changed" is the guard agreeing with a tree it never
  // saw; a null head would be written into the stamp as the word "null".
  if (branch === null || dirty === null || head === null) {
    return [
      "publish was asked for, and git could not be read.",
      "The release is built from main and stamped with its commit;",
      "neither can be answered here.",
    ];
  }
  if (branch !== "main") {
    return [
      `publish was asked for on ${branch}.`,
      "The release is built from main, so this would upload a bundle",
      "that is not what the tag points at.",
    ];
  }
  // --porcelain is empty on a clean tree and one line per change otherwise.
  // Untracked files count: dist/ and out/ are ignored, so what is left is
  // something somebody made and has not decided about.
  if (dirty) {
    return [
      "publish was asked for with uncommitted changes:",
      ...dirty
        .split("\n")
        .slice(0, 10)
        .map((line) => `  ${line}`),
      "An installer built over these is not any commit's.",
    ];
  }
  return null;
}

/** Ask git, judge, and stop if the answer is no. Returns the commit built. */
function refuseUnlessReleasable() {
  const head = git("rev-parse", "HEAD");
  const blocker = releaseBlocker({
    branch: git("rev-parse", "--abbrev-ref", "HEAD"),
    dirty: git("status", "--porcelain"),
    head,
  });
  if (blocker) {
    for (const line of blocker) console.error(line);
    process.exit(2);
  }
  return head;
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
  const known = new Set(["--mac", "--publish", "--preflight"]);
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
  return {
    mac: argv.includes("--mac"),
    publish: argv.includes("--publish"),
    preflight: argv.includes("--preflight"),
  };
}

function main() {
  let mac, publish, preflight;
  try {
    ({ mac, publish, preflight } = parseArgs(process.argv.slice(2)));
  } catch (e) {
    // The message is the point; a stack trace would bury it.
    console.error(e.message);
    process.exit(2);
  }
  // Asked before the tests rather than only inside the build, because the
  // tests begin with a full build: without this, a publish from the wrong
  // branch is refused several minutes and one compiled application later. The
  // same check runs again below -- a tree can be edited while the tests run.
  if (preflight) {
    refuseUnlessReleasable();
    return;
  }

  const commit = publish ? refuseUnlessReleasable() : null;
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
  // Written after the build rather than before it, so a build that died leaves
  // no claim about what it produced.
  fs.writeFileSync(path.join(ROOT, out, STAMP), `${commit}\n`);
  console.log(`built from ${commit}`);
  // --awaiting-mac says "the mac half is somebody else's job", which is true of
  // the Windows build and the exact opposite of the mac one. Passing it either
  // way would let a mac build that produced nothing report a complete release:
  // its own missing files would be excused as owed. The flag belongs to the
  // half that is not building mac. See check-release.js.
  run(path.join(__dirname, "check-release.js"), [
    out,
    ...(mac ? [] : ["--awaiting-mac"]),
  ]);
}

module.exports = { outputDir, builderCli, parseArgs, STAMP, releaseBlocker };

if (require.main === module) main();
