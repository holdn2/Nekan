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

import { outputDir } from "#tools/dist.js";

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
  // Taking it literally would put the build at the repository root and delete
  // the repository, since electron-builder clears its output directory first.
  withEnv("", () => assert.equal(outputDir(), configured()));
});
