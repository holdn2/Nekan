/**
 * The app and the widget agree on where the board lives and what shape it has.
 *
 * Four values are written twice, once here in TypeScript and once in
 * BoardWidget.swift, and nothing else compares them: a mismatch builds, signs
 * and installs cleanly, and the widget says "open the app once" forever. The
 * version is the sharpest of the four -- the app moves by OTA and the widget
 * only by a build, so a bump on one side alone blanks every installed widget.
 *
 * publish.ts is read as text rather than imported: it pulls in the native
 * storage module, which does not exist under Node.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { FEED_VERSION } from "../feed";

const mobile = join(__dirname, "..", "..");
const swift = readFileSync(
  join(mobile, "targets", "quick", "BoardWidget.swift"),
  "utf8",
);
const publish = readFileSync(join(mobile, "widget", "publish.ts"), "utf8");

function swiftString(name: string): string | undefined {
  return swift.match(new RegExp(`let ${name} = "([^"]*)"`))?.[1];
}

function tsString(name: string): string | undefined {
  return publish.match(new RegExp(`export const ${name} = "([^"]*)"`))?.[1];
}

test("both sides open the same App Group", () => {
  expect(tsString("APP_GROUP")).toBeTruthy();
  expect(swiftString("appGroup")).toBe(tsString("APP_GROUP"));
});

test("both sides use the same keys", () => {
  expect(tsString("FEED_KEY")).toBeTruthy();
  expect(swiftString("feedKey")).toBe(tsString("FEED_KEY"));
  expect(tsString("LANG_KEY")).toBeTruthy();
  expect(swiftString("langKey")).toBe(tsString("LANG_KEY"));
});

test("the widget reads the feed version the app writes", () => {
  const supported = swift.match(/static let supportedVersion = (\d+)/)?.[1];
  expect(supported).toBeDefined();
  expect(Number(supported)).toBe(FEED_VERSION);
});

test("both sides use the same key for the widget's checks", () => {
  expect(tsString("DONE_KEY")).toBeTruthy();
  expect(swiftString("doneKey")).toBe(tsString("DONE_KEY"));
});
