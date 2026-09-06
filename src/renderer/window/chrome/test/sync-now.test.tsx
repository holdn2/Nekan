/**
 * The sync control in the title bar.
 *
 * Two of these guard things that a running app hides rather than shows. The
 * ageing one especially: it is only wrong after minutes have passed with
 * nothing else happening, which is exactly the state nobody sits and watches.
 */

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mount, flush } from "../../../react/testing.js";
import { applySyncStatus } from "../../../views/account/status.js";
import { SyncNow } from "../sync-now.js";

/**
 * The words are English here: nothing initialises a language in this
 * environment, so i18next falls back, and `en` is the fallback the app ships.
 */

/** Frozen, so "how long ago" only moves when a test moves it. */
const T0 = Date.UTC(2026, 8, 7, 12, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
  applySyncStatus(null);
});

const words = (container: HTMLElement) =>
  container.querySelector("span")?.textContent ?? null;

test("says nothing at all when nobody is signed in", async () => {
  applySyncStatus({ state: "off", unsent: 0 });
  const { container } = await mount(<SyncNow />);

  expect(container.querySelector(".sync-now")).toBe(null);
});

test("says how long ago the last sync was", async () => {
  applySyncStatus({ state: "synced", unsent: 0, syncedAt: T0 - 5000 });
  const { container } = await mount(<SyncNow />);

  expect(words(container)).toContain("just now");
});

test("the ago keeps up with the clock on its own", async () => {
  // Nothing else brings this back. main only pushes a status when something in
  // it changed, and a long stretch offline changes nothing -- same phase, same
  // count, same syncedAt. Without the timer the words would still read "방금"
  // an hour later, which is worse than saying nothing.
  applySyncStatus({ state: "synced", unsent: 0, syncedAt: T0 });
  const { container } = await mount(<SyncNow />);
  expect(words(container)).toContain("just now");

  await flush(() => {
    vi.setSystemTime(T0 + 3 * 60_000);
    vi.advanceTimersByTime(30_000);
  });

  expect(words(container)).toContain("3 minutes ago");
  expect(words(container)).not.toContain("just now");
});

test("a count of waiting edits replaces the state word", async () => {
  applySyncStatus({ state: "synced", unsent: 2, syncedAt: T0 });
  const { container } = await mount(<SyncNow />);

  expect(words(container)).toContain("2");
});

test("the button asks main to sync, and looks busy for a moment after", async () => {
  const syncNow = vi.fn().mockResolvedValue(true);
  // window.api is a frozen contextBridge object in the app; in happy-dom it is
  // whatever a test puts there, and this needs only the one call.
  (window as unknown as { api: { syncNow: () => Promise<boolean> } }).api = {
    syncNow,
  };
  applySyncStatus({ state: "synced", unsent: 0, syncedAt: T0 });
  const { container } = await mount(<SyncNow />);

  const button = container.querySelector<HTMLButtonElement>("#syncNowBtn");
  await flush(() => button?.click());

  expect(syncNow).toHaveBeenCalledTimes(1);
  // Measured: a run reaches `syncing` at +9ms and is back at +169ms, so the
  // truthful state change is invisible and the press looks unanswered.
  expect(button?.className).toContain("is-syncing");

  await flush(() => vi.advanceTimersByTime(700));
  expect(button?.className).not.toContain("is-syncing");
});
