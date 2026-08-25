/**
 * Where the packaged output goes.
 *
 * One line of logic, and it earns a test because two programs have to agree on
 * its answer: electron-builder writes there and tools/check-release.js
 * re-uploads from there when a draft splits. If they disagree the build looks
 * fine and the repair reports files as missing that are sitting on disk.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { builderCli, outputDir, parseArgs } from "#tools/dist.js";

/** What package.json configures, read the way the entitlements test reads its file. */
const configured = () =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"))
    .build.directories.output;

/** Read it with NEKAN_DIST set to this, then put the environment back. */
function withEnv(value: string | undefined, run: () => void) {
  const had = Object.prototype.hasOwnProperty.call(process.env, "NEKAN_DIST");
  const before = process.env.NEKAN_DIST;
  if (value === undefined) delete process.env.NEKAN_DIST;
  else process.env.NEKAN_DIST = value;
  try {
    run();
  } finally {
    if (had) process.env.NEKAN_DIST = before;
    else delete process.env.NEKAN_DIST;
  }
}

test("unset, it is whatever package.json configures", () => {
  // Not asserted as the literal "dist": the point is that dist.js does not hold
  // a second copy of the answer, so it has to follow the config rather than
  // agree with it by coincidence.
  assert.equal(typeof configured(), "string");
  withEnv(undefined, () => assert.equal(outputDir(), configured()));
});

test("NEKAN_DIST wins, which is the whole reason it exists", () => {
  // Builds inside this repository hit a file lock on the .asar that no process
  // owns, and the directory cannot even be renamed. Somewhere outside it works
  // first time.
  withEnv("C:/Users/someone/AppData/Local/Temp/nekan-dist", () =>
    assert.equal(outputDir(), "C:/Users/someone/AppData/Local/Temp/nekan-dist"),
  );
});

test("an empty NEKAN_DIST is not an answer", () => {
  // Exporting it as "" is how a shell says "I meant to set this and did not".
  // Taken literally it points the build at the repository root: a hundred
  // megabytes of installer and a win-unpacked/ tree land there as untracked
  // files, and .gitignore covers dist/ and dist*/ but not the root itself.
  withEnv("", () => assert.equal(outputDir(), configured()));
});

test("electron-builder's CLI is where its package says it is", () => {
  // The whole reason for resolving it is that npx cannot be spawned without a
  // shell on Windows, and a shell would re-parse the output path: a directory
  // with a space in it arrives as several arguments, and anything after an `&`
  // runs as its own command. If a future electron-builder moves its bin, this
  // says so now rather than during a release.
  const cli = builderCli();
  assert.ok(cli.endsWith(".js"), `expected a .js entry, got ${cli}`);
  assert.ok(fs.existsSync(cli), `${cli} does not exist`);
});

test("--publish never is refused rather than read as --publish", () => {
  // npm appends everything after `--` to the script, and "--publish never" is
  // what package.json said one commit ago -- so it is in muscle memory and in
  // the git history someone greps. A membership test would see --publish, set
  // publish, and upload for real. The word meaning "definitely do not" would
  // cause the thing.
  assert.throws(() => parseArgs(["--publish", "never"]), /unknown argument/);
  assert.throws(() => parseArgs(["--publish=never"]), /unknown argument/);
});

test("a flag meant for electron-builder is refused, not dropped", () => {
  // Nothing is forwarded, so these used to look like they did something.
  for (const flag of [
    "--dir",
    "--arm64",
    "--x64",
    "-c.extraMetadata.version=9",
  ]) {
    assert.throws(() => parseArgs([flag]), /unknown argument/, flag);
  }
});

test("the two flags it does take still work, together and apart", () => {
  assert.deepEqual(parseArgs([]), { mac: false, publish: false });
  assert.deepEqual(parseArgs(["--mac"]), { mac: true, publish: false });
  assert.deepEqual(parseArgs(["--publish"]), { mac: false, publish: true });
  assert.deepEqual(parseArgs(["--mac", "--publish"]), {
    mac: true,
    publish: true,
  });
});
