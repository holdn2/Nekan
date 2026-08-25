import test from "node:test";
import assert from "node:assert/strict";

import { auditAssets, macArches, planFold } from "#tools/check-release.js";

// The names electron-builder actually produced for v1.0.0.
const WIN = [
  "Nekan-Setup-1.0.0.exe",
  "Nekan-Setup-1.0.0.exe.blockmap",
  "latest.yml",
];

// Exactly what the first mac CI run wrote (PR #76). Both blockmap kinds are
// here because the build makes both, not because both are required.
const MAC = [
  "Nekan-1.0.0-arm64.dmg",
  "Nekan-1.0.0-arm64.dmg.blockmap",
  "Nekan-1.0.0-arm64.zip",
  "Nekan-1.0.0-arm64.zip.blockmap",
  "Nekan-1.0.0-x64.dmg",
  "Nekan-1.0.0-x64.dmg.blockmap",
  "Nekan-1.0.0-x64.zip",
  "Nekan-1.0.0-x64.zip.blockmap",
  "latest-mac.yml",
];

const ARCHES = ["arm64", "x64"];

test("the architectures come from the build config, not from a copy of it", () => {
  // If these stop matching, every per-arch rule below is checking the wrong
  // thing -- and would go on passing.
  assert.deepEqual(macArches(), ARCHES);
});

test("a Windows-only release passes, and mac is not asked for", () => {
  const { platforms, missing, unexpected } = auditAssets(WIN, ARCHES);
  assert.deepEqual(platforms, ["windows"]);
  assert.deepEqual(missing, []);
  assert.deepEqual(unexpected, []);
});

test("Windows is asked for even when nothing of its own arrived", () => {
  // `npm run release` builds Windows, so an empty draft is a silent failure,
  // not a release that has not got there yet.
  const { platforms, missing } = auditAssets([], ARCHES);
  assert.deepEqual(platforms, ["windows"]);
  assert.equal(missing.length, 3);
});

test("a missing blockmap fails -- everyone would download the whole installer", () => {
  const { missing } = auditAssets(
    ["Nekan-Setup-1.0.0.exe", "latest.yml"],
    ARCHES,
  );
  assert.deepEqual(missing, ["windows: installer blockmap"]);
});

test("a missing latest.yml fails -- nobody would update at all", () => {
  const { missing } = auditAssets(
    WIN.filter((n) => n !== "latest.yml"),
    ARCHES,
  );
  assert.deepEqual(missing, ["windows: latest.yml"]);
});

test("a mac blockmap does not stand in for the installer's", () => {
  // The old check accepted any name ending in .blockmap, so the mac zip's
  // would have covered for a Windows release that shipped without one.
  const { missing } = auditAssets(
    ["Nekan-Setup-1.0.0.exe", "latest.yml", ...MAC],
    ARCHES,
  );
  assert.ok(missing.includes("windows: installer blockmap"));
});

test("everything the first mac CI build produced is accepted", () => {
  const { platforms, missing, unexpected } = auditAssets(
    [...WIN, ...MAC],
    ARCHES,
  );
  assert.deepEqual(platforms, ["windows", "mac"]);
  assert.deepEqual(missing, []);
  // The .dmg blockmaps are owned but not required: the build writes them and
  // nothing reads them, since mac updates come from the zip.
  assert.deepEqual(unexpected, []);
});

test("one architecture shipping alone fails, with the other one named", () => {
  // "some .zip exists" used to be enough, which passes an arm64-only release
  // and leaves every Intel Mac with no file it can run.
  const { missing } = auditAssets(
    [...WIN, ...MAC.filter((n) => !n.includes("x64"))],
    ARCHES,
  );
  assert.deepEqual(missing, [
    "mac: x64 dmg",
    "mac: x64 zip",
    "mac: x64 zip blockmap",
  ]);
});

test("a dmg without its zip fails -- it installs once and never updates", () => {
  const noZip = MAC.filter((n) => !n.endsWith(".zip"));
  const { missing } = auditAssets([...WIN, ...noZip], ARCHES);
  assert.deepEqual(missing, ["mac: arm64 zip", "mac: x64 zip"]);
});

test("a zip without its blockmap fails -- that arch re-downloads the app every time", () => {
  const noBlockmap = MAC.filter((n) => !n.endsWith(".zip.blockmap"));
  const { missing } = auditAssets([...WIN, ...noBlockmap], ARCHES);
  assert.deepEqual(missing, [
    "mac: arm64 zip blockmap",
    "mac: x64 zip blockmap",
  ]);
});

test("a mac build that never wrote its feed fails", () => {
  const noFeed = MAC.filter((n) => n !== "latest-mac.yml");
  const { missing } = auditAssets([...WIN, ...noFeed], ARCHES);
  assert.deepEqual(missing, ["mac: latest-mac.yml"]);
});

test("a universal build is judged by the arches it declares", () => {
  // Not what this repo builds today. It is here because the rules read their
  // architectures from the config, and this is what that buys: switching to
  // one universal binary needs no change here.
  const universal = [
    "Nekan-1.0.0-universal.dmg",
    "Nekan-1.0.0-universal.zip",
    "Nekan-1.0.0-universal.zip.blockmap",
    "latest-mac.yml",
  ];
  const { missing, unexpected } = auditAssets(
    [...WIN, ...universal],
    ["universal"],
  );
  assert.deepEqual(missing, []);
  assert.deepEqual(unexpected, []);
});

test("a file no platform claims stops the release", () => {
  // A target nobody wrote a rule for, or something that does not belong in a
  // release at all. This is what the old three-asset count was really saying.
  const { unexpected } = auditAssets([...WIN, "Nekan-1.0.0.AppImage"], ARCHES);
  assert.deepEqual(unexpected, ["Nekan-1.0.0.AppImage"]);
});

const draft = (id: number, assets: string[], name?: string) => ({
  id,
  name,
  assets: assets.map((n) => ({ name: n })),
});

test("the draft holding latest.yml is the one that survives", () => {
  // It is the feed: the file installed apps actually read.
  const a = draft(1, ["Nekan-Setup-1.0.1.exe"]);
  const b = draft(2, ["latest.yml"]);
  assert.equal(planFold([a, b]).keep.id, 2);
  assert.deepEqual(
    planFold([a, b]).fold.map((r) => r.id),
    [1],
  );
});

test("a draft with no assets is left alone, not deleted", () => {
  // This is the one irreversible thing the script does, and it cannot tell who
  // made a draft -- the filter upstream is only "draft, and this tag". An empty
  // one is far more likely to be a person drafting release notes than an upload
  // that split. Folding it would move nothing, so deleting it gains nothing and
  // can cost the notes, which GitHub does not give back.
  const notes = draft(1, [], "1.0.1 release notes");
  const built = draft(2, ["latest.yml", "Nekan-Setup-1.0.1.exe"]);
  const plan = planFold([notes, built]);
  assert.equal(plan.keep.id, 2);
  assert.deepEqual(plan.fold, []);
  assert.deepEqual(
    plan.leave.map((r) => r.id),
    [1],
  );
});

test("a real split is still folded", () => {
  // What the function is for: electron-builder's uploaders racing and each
  // making a draft, with the blockmap landing on its own.
  const withFeed = draft(1, ["latest.yml", "Nekan-Setup-1.0.1.exe"]);
  const stray = draft(2, ["Nekan-Setup-1.0.1.exe.blockmap"]);
  const plan = planFold([withFeed, stray]);
  assert.equal(plan.keep.id, 1);
  assert.deepEqual(
    plan.fold.map((r) => r.id),
    [2],
  );
  assert.deepEqual(plan.leave, []);
});

test("with no latest.yml anywhere it keeps the first and folds the rest", () => {
  // A run that died before writing the feed. Nothing is deleted that has files
  // in it without those files moving first.
  const plan = planFold([draft(1, ["a.exe"]), draft(2, ["b.blockmap"])]);
  assert.equal(plan.keep.id, 1);
  assert.deepEqual(
    plan.fold.map((r) => r.id),
    [2],
  );
});
