/**
 * The entitlements plist, checked here because the only other thing that reads
 * it is codesign, on a Mac, halfway through a release build.
 *
 * codesign does not use a general XML parser. It uses AMFI's, which is strict
 * about the one thing this repository's comment style breaks: a double hyphen
 * inside an XML comment is illegal, and `--` is how every other file here
 * writes an em dash. The first signed build died on it (2026-08-24):
 *
 *   Failed to parse entitlements: AMFIUnserializeXML: syntax error near line 10
 *
 * Everything up to that point had gone right -- the certificate imported, the
 * identity was found, signing started -- so the failure arrived several minutes
 * and one macOS runner into the job, which is a slow way to learn about a
 * hyphen.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// npm runs scripts from the package root, and this file is only ever reached
// through `npm test`. Resolving from __dirname would follow the build output
// into out/test/, which is a different depth from the source.
const FILE = path.join(process.cwd(), "build", "entitlements.mac.plist");

const source = () => {
  assert.ok(
    fs.existsSync(FILE),
    `${FILE} is missing -- build.mac.entitlements in package.json points at it`,
  );
  return fs.readFileSync(FILE, "utf8");
};

/** Every `<!-- ... -->` span, without its delimiters. */
function comments(xml: string) {
  const found = [];
  let at = 0;
  for (;;) {
    const open = xml.indexOf("<!--", at);
    if (open === -1) break;
    const close = xml.indexOf("-->", open + 4);
    assert.notEqual(close, -1, "a comment is opened and never closed");
    found.push({
      // The line the comment starts on, so a failure names the same place
      // codesign would.
      line: xml.slice(0, open).split("\n").length,
      body: xml.slice(open + 4, close),
    });
    at = close + 3;
  }
  return found;
}

test("no comment contains a double hyphen", () => {
  for (const { line, body } of comments(source())) {
    assert.ok(
      !body.includes("--"),
      `the comment starting at line ${line} contains "--". That is illegal XML, ` +
        `and codesign rejects the whole file with AMFIUnserializeXML: syntax error. ` +
        `Write the em dash some other way.`,
    );
  }
});

/**
 * The file with every comment taken out.
 *
 * Asking the raw text whether it "includes" a key answers yes when the prose
 * merely mentions one -- which is how the sandbox check below first passed a
 * file that talks about app-sandbox and grants it nothing. The comments here
 * name the entitlements they are explaining, so they have to go before
 * anything is asserted about what is granted.
 */
function granted(xml = source()) {
  let out = xml;
  for (const { body } of comments(xml)) out = out.replace(`<!--${body}-->`, "");
  return out;
}

test("the three hardened-runtime entitlements are all granted", () => {
  const xml = granted();
  // Not a taste in capabilities: the hardened runtime refuses each of these
  // outright, and Electron opens to a blank window with the crash inside V8.
  for (const key of [
    "com.apple.security.cs.allow-jit",
    "com.apple.security.cs.allow-unsigned-executable-memory",
    "com.apple.security.cs.allow-dyld-environment-variables",
  ]) {
    const tag = `<key>${key}</key>`;
    const at = xml.indexOf(tag);
    assert.notEqual(at, -1, `${key} is missing`);
    // Present is not the same as granted. A plist is a flat list of key
    // followed by value, so <false/> here is a well-formed file that signs
    // cleanly and hands V8 nothing -- the same blank window as leaving the key
    // out, with none of the evidence.
    const value = xml.slice(at + tag.length).trimStart();
    assert.ok(
      value.startsWith("<true/>"),
      `${key} is present but not granted: the value after it is ${value.slice(0, 20)}`,
    );
  }
});

test("the sandbox entitlement stays out", () => {
  // app-sandbox belongs to a Mac App Store build, which this is not, and it
  // would take away the loopback listener Google sign-in returns to. The
  // comment above it says so, which is exactly why this asks granted() rather
  // than the file.
  assert.ok(!granted().includes("com.apple.security.app-sandbox"));
});

test("every key has a value after it", () => {
  const xml = granted();
  const keys = xml.match(/<key>/g)?.length ?? 0;
  const values = xml.match(/<(true|false)\/>/g)?.length ?? 0;
  // A key with nothing after it parses, and then grants nothing. There is no
  // error to read: the app is simply signed without the entitlement.
  assert.equal(keys, values, `${keys} keys but ${values} values`);
});
