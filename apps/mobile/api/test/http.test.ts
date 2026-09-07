/**
 * That the clock the phone stamps with is the server's, not the device's.
 *
 * Every reply carries a `Date`, and `request` reads it -- that part was never
 * missing. What was missing was the line that hands the result to the store,
 * so the offset was measured on every call and thrown away while `now()` went
 * on returning the raw device clock. Nothing failed: `updatedAt` decides which
 * of two devices wins, so the only symptom is somebody else's edit winning,
 * on a phone whose owner has no reason to suspect their clock.
 *
 * A unit test rather than a reading of the source, because reading it is what
 * missed it: both halves were there and looked finished.
 */

import { beforeEach, expect, test, vi } from "vitest";

/** The one module below the store that would need a device. */
vi.mock("../../store/persist", () => ({
  load: async () => ({ tasks: [], settings: {} }),
  save: async () => {},
  storePath: () => "/nowhere/data.json",
}));

const { request } = await import("../http");
const { now, setClockOffset } = await import("../../store/state");

/** A reply that says the server is `aheadMs` in front of this machine. */
function replyDated(aheadMs: number) {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (h: string) =>
        h === "date" ? new Date(Date.now() + aheadMs).toUTCString() : null,
    },
    text: async () => "[]",
  };
}

beforeEach(() => {
  setClockOffset(0);
});

test("a reply teaches the store what time the server thinks it is", async () => {
  const ahead = 10 * 60 * 1000;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => replyDated(ahead)),
  );

  const before = now() - Date.now();
  await request("/rest/v1/tasks");
  const after = now() - Date.now();

  // The header carries whole seconds, so the offset lands within a second of
  // ten minutes rather than on it.
  expect(before).toBe(0);
  expect(Math.abs(after - ahead)).toBeLessThan(1500);
});

test("a failed reply teaches it too", async () => {
  // The offset is read off the reply rather than the success, on purpose: a
  // 401 carries a Date like anything else, and a phone that only learns the
  // time from replies it liked stamps its edits wrong for as long as its
  // token is bad.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ...replyDated(90_000), ok: false, status: 401 })),
  );

  await request("/rest/v1/tasks");

  expect(Math.abs(now() - Date.now() - 90_000)).toBeLessThan(1500);
});

test("a request that never reaches the server leaves the clock alone", async () => {
  setClockOffset(60_000);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("offline");
    }),
  );

  const res = await request("/rest/v1/tasks");

  expect(res.status).toBe(0);
  expect(Math.abs(now() - Date.now() - 60_000)).toBeLessThan(1500);
});
