import test from "node:test";
import assert from "node:assert/strict";

import { auditAssets } from "#tools/check-release.js";

// The names electron-builder actually produced for v1.0.0.
const WIN = [
  "Nekan-Setup-1.0.0.exe",
  "Nekan-Setup-1.0.0.exe.blockmap",
  "latest.yml",
];

// What build.mac is configured to produce: two targets across two arches.
const MAC = [
  "Nekan-1.0.0-arm64.dmg",
  "Nekan-1.0.0-arm64.zip",
  "Nekan-1.0.0-arm64.zip.blockmap",
  "Nekan-1.0.0-x64.dmg",
  "Nekan-1.0.0-x64.zip",
  "Nekan-1.0.0-x64.zip.blockmap",
  "latest-mac.yml",
];

test("a Windows-only release passes, and mac is not asked for", () => {
  const { platforms, missing, unexpected } = auditAssets(WIN);
  assert.deepEqual(platforms, ["windows"]);
  assert.deepEqual(missing, []);
  assert.deepEqual(unexpected, []);
});

test("Windows is asked for even when nothing of its own arrived", () => {
  // `npm run release` builds Windows, so an empty draft is a silent failure,
  // not a release that has not got there yet.
  const { platforms, missing } = auditAssets([]);
  assert.deepEqual(platforms, ["windows"]);
  assert.equal(missing.length, 3);
});

test("a missing blockmap fails -- everyone would download the whole installer", () => {
  const { missing } = auditAssets(["Nekan-Setup-1.0.0.exe", "latest.yml"]);
  assert.deepEqual(missing, ["windows: installer blockmap"]);
});

test("a missing latest.yml fails -- nobody would update at all", () => {
  const { missing } = auditAssets(WIN.filter((n) => n !== "latest.yml"));
  assert.deepEqual(missing, ["windows: latest.yml"]);
});

test("a mac blockmap does not stand in for the installer's", () => {
  // The old check accepted any name ending in .blockmap, so the mac zip's
  // would have covered for a Windows release that shipped without one.
  const { missing } = auditAssets([
    "Nekan-Setup-1.0.0.exe",
    "latest.yml",
    ...MAC,
  ]);
  assert.ok(missing.includes("windows: installer blockmap"));
});

test("mac is checked once any mac file shows up", () => {
  const { platforms, missing, unexpected } = auditAssets([...WIN, ...MAC]);
  assert.deepEqual(platforms, ["windows", "mac"]);
  assert.deepEqual(missing, []);
  assert.deepEqual(unexpected, []);
});

test("a dmg without a zip fails -- it installs once and never updates", () => {
  const half = MAC.filter((n) => !n.endsWith(".zip"));
  const { platforms, missing } = auditAssets([...WIN, ...half]);
  assert.deepEqual(platforms, ["windows", "mac"]);
  assert.deepEqual(missing, ["mac: zip"]);
});

test("a mac build that never wrote its feed fails", () => {
  const half = MAC.filter((n) => n !== "latest-mac.yml");
  const { missing } = auditAssets([...WIN, ...half]);
  assert.deepEqual(missing, ["mac: latest-mac.yml"]);
});

test("a file no platform claims stops the release", () => {
  // A target nobody wrote a rule for, or something that does not belong in a
  // release at all. This is what the old three-asset count was really saying.
  const { unexpected } = auditAssets([...WIN, "Nekan-1.0.0.AppImage"]);
  assert.deepEqual(unexpected, ["Nekan-1.0.0.AppImage"]);
});
