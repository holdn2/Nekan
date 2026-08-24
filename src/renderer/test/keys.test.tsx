/**
 * Which modifier counts as the accelerator.
 *
 * Worth a test even though it is four lines: the answer is decided once, at
 * import time, from a value only the preload can supply, and getting it wrong
 * is not a shortcut that misbehaves -- it is every shortcut doing nothing on
 * one of the two platforms, which is exactly the state this file was written to
 * end.
 */

import { expect, test, vi } from "vitest";

/** Re-import keys.ts with `window.api.platform` set to this. */
async function keysOn(platform: string | undefined) {
  vi.resetModules();
  if (platform === undefined) {
    // @ts-expect-error -- the test is the only place window.api is absent.
    delete window.api;
  } else {
    // @ts-expect-error -- a stand-in for what contextBridge exposes.
    window.api = { platform };
  }
  return import("../keys.js");
}

const press = (init: KeyboardEventInit) =>
  new KeyboardEvent("keydown", { key: "m", ...init });

test("Ctrl is the accelerator away from macOS", async () => {
  const { accel, isMac, accelName } = await keysOn("win32");
  expect(isMac).toBe(false);
  expect(accelName()).toBe("Ctrl");
  expect(accel(press({ ctrlKey: true }))).toBe(true);
  expect(accel(press({ metaKey: true }))).toBe(false);
});

test("Cmd is the accelerator on macOS, and Ctrl stops being one", async () => {
  const { accel, isMac, accelName } = await keysOn("darwin");
  expect(isMac).toBe(true);
  expect(accelName()).toBe("Cmd");
  expect(accel(press({ metaKey: true }))).toBe(true);
  // Not a near miss to be forgiving about: a Mac's Ctrl+M is a different
  // gesture, and treating it as the accelerator would fire the shortcut while
  // the user was reaching for something else.
  expect(accel(press({ ctrlKey: true }))).toBe(false);
});

test("AltGr and Option are not the accelerator, on either platform", async () => {
  for (const platform of ["win32", "darwin"]) {
    const { accel } = await keysOn(platform);
    // AltGr arrives as ctrlKey+altKey on Windows; Option composes characters on
    // macOS. Both would otherwise fire a shortcut *and* lose the character to
    // preventDefault.
    expect(accel(press({ ctrlKey: true, altKey: true }))).toBe(false);
    expect(accel(press({ metaKey: true, altKey: true }))).toBe(false);
  }
});

test("no preload means Ctrl, not a crash", async () => {
  // window.api is undefined in a bare renderer -- and was undefined for real
  // once, when a preload tried to require a local file. Reading .platform off
  // it must not be the thing that takes the shortcuts down with it.
  const { accel, isMac } = await keysOn(undefined);
  expect(isMac).toBe(false);
  expect(accel(press({ ctrlKey: true }))).toBe(true);
});
