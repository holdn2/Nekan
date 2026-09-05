/**
 * The stored session, and the ways a keychain can refuse.
 *
 * Storage failures are the quiet kind: `SecureStore` rejects, the app carries
 * on, and what went wrong only shows up a launch later. The direction that
 * matters most is delete -- a write that fails leaves an old session to be
 * renewed and dropped, but a delete that fails leaves a live one for the next
 * launch to restore, which signs somebody back in after they signed out.
 */

import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Session } from "@nekan/shared/types";

const store = {
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
};

vi.mock("expo-secure-store", () => ({
  ...store,
  getItemAsync: (...a: unknown[]) => store.getItemAsync(...a),
  setItemAsync: (...a: unknown[]) => store.setItemAsync(...a),
  deleteItemAsync: (...a: unknown[]) => store.deleteItemAsync(...a),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "when-unlocked-this-device-only",
}));

const { readSession, writeSession, clearSession } = await import("../tokens");

const session: Session = {
  accessToken: "at",
  refreshToken: "rt",
  expiresAt: 9_999_999_999_999,
  userId: "u1",
  email: "who@example.com",
};

beforeEach(() => {
  store.getItemAsync.mockReset().mockResolvedValue(null);
  store.setItemAsync.mockReset().mockResolvedValue(undefined);
  store.deleteItemAsync.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("writing", () => {
  test("stores the session under one key, for this device only", async () => {
    expect(await writeSession(session)).toBe(true);
    const [key, value, options] = store.setItemAsync.mock.calls[0];
    expect(key).toBe("nekan.session");
    expect(JSON.parse(value as string).refreshToken).toBe("rt");
    expect((options as { keychainAccessible: string }).keychainAccessible).toBe(
      "when-unlocked-this-device-only",
    );
  });

  test("says so when the keychain refuses", async () => {
    store.setItemAsync.mockRejectedValue(new Error("locked"));
    expect(await writeSession(session)).toBe(false);
  });
});

describe("clearing", () => {
  test("deletes the entry", async () => {
    expect(await clearSession()).toBe(true);
    expect(store.deleteItemAsync).toHaveBeenCalledWith("nekan.session");
  });

  test("a refused delete does not pass as a sign-out on its own", async () => {
    // The regression: reporting success here leaves the session on disk, and
    // the next launch restores somebody who asked to leave.
    store.deleteItemAsync.mockRejectedValue(new Error("locked"));
    store.setItemAsync.mockRejectedValue(new Error("locked"));

    expect(await clearSession()).toBe(false);
  });

  test("a refused delete falls back to making the entry unreadable", async () => {
    store.deleteItemAsync.mockRejectedValue(new Error("locked"));

    expect(await clearSession()).toBe(true);
    expect(store.setItemAsync).toHaveBeenCalledWith("nekan.session", "");

    // And that is the whole point of the fallback: what stays behind cannot
    // be read back as a session.
    store.getItemAsync.mockResolvedValue("");
    expect(await readSession()).toBe(null);
  });
});

describe("reading", () => {
  test("returns the session that was stored", async () => {
    store.getItemAsync.mockResolvedValue(JSON.stringify(session));
    expect((await readSession())?.userId).toBe("u1");
  });

  test("treats an unreadable entry as no session rather than a crash", async () => {
    store.getItemAsync.mockResolvedValue("{ not json");
    expect(await readSession()).toBe(null);
  });

  test("treats a refusal as no session", async () => {
    store.getItemAsync.mockRejectedValue(new Error("locked"));
    expect(await readSession()).toBe(null);
  });
});
