#!/usr/bin/env node
/**
 * Every native module the phone uses, against the version its SDK ships.
 *
 * Expo Go carries the *native* half of these compiled in. When the JavaScript
 * half is a different version the app does not warn -- it throws from inside a
 * host function with no version in the message, and the stack points at
 * whichever file happened to import it first. That is the shape of the bug
 * this exists to prevent, and it cost an afternoon:
 *
 *   Exception in HostFunction: <unknown>
 *     installTurboModule
 *     constructor (react-native-worklets/.../NativeWorklets.native.ts)
 *
 * `expo install --check` does not catch it. That command reads the app's own
 * package.json, and the offender was react-native-worklets -- pulled in by
 * reanimated, declared by nobody, and therefore invisible to it. This walks
 * what is actually on disk instead, which is the only list that matters.
 *
 * The SDK's own manifest is the authority for versions, not npm's `latest`
 * tag: latest ran ahead of the SDK twice in one day, and the second time it
 * took a file the bundler loads with it.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const APP = path.join(ROOT, "apps", "mobile");
const TREES = [path.join(ROOT, "node_modules"), path.join(APP, "node_modules")];

/** Nothing to check before the phone app has been installed. */
function expoManifest() {
  for (const tree of TREES) {
    const file = path.join(tree, "expo", "bundledNativeModules.json");
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  return null;
}

function installed(tree, name) {
  const file = path.join(tree, name, "package.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")).version;
}

/**
 * Whether an installed version is the one the SDK means.
 *
 * Deliberately stricter than semver would be. `~4.1.1` is read as "this minor"
 * and a bare version as "exactly this", because the thing on the other side is
 * a compiled binary rather than a library that promises compatibility.
 */
function matches(want, got) {
  const clean = String(want).replace(/^[~^]/, "");
  const minor = (v) => v.split(".").slice(0, 2).join(".");
  if (String(want).startsWith("~")) return minor(got) === minor(clean);
  if (String(want).startsWith("^"))
    return got.split(".")[0] === clean.split(".")[0];
  return got === clean;
}

function main() {
  const bundled = expoManifest();
  if (!bundled) {
    console.log("check-native: expo is not installed, nothing to check");
    return 0;
  }

  const wrong = [];
  let checked = 0;
  for (const tree of TREES) {
    if (!fs.existsSync(tree)) continue;
    for (const [name, want] of Object.entries(bundled)) {
      const got = installed(tree, name);
      if (!got) continue;
      checked += 1;
      if (!matches(want, got)) {
        wrong.push({ name, want, got, tree: path.relative(ROOT, tree) });
      }
    }
  }

  if (!wrong.length) {
    console.log(`check-native: ${checked} native modules match the SDK`);
    return 0;
  }

  console.error(
    `\ncheck-native: ${wrong.length} of ${checked} do not match the SDK Expo Go carries.\n`,
  );
  for (const w of wrong) {
    console.error(
      `  ${w.name} is ${w.got}, the SDK ships ${w.want}  (${w.tree})`,
    );
  }
  console.error(
    "\nPin it in apps/mobile/package.json, and in the root overrides if" +
      " something else pulls it in.\n",
  );
  return 1;
}

process.exit(main());
