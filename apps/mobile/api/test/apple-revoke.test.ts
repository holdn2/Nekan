/**
 * Asking Apple to let go.
 *
 * Two things here are worth a test rather than a reading. The sheet must not
 * be shown to somebody who signed in with Google -- a Face ID prompt in the
 * middle of deleting an account is alarming when it has no reason to be there
 * -- and closing the sheet has to come back as its own answer, because the
 * caller stops on that one and walks past every other failure.
 */

import { beforeEach, expect, test, vi } from "vitest";

const http = vi.hoisted(() => ({ request: vi.fn() }));
const sheet = vi.hoisted(() => ({ signInAsync: vi.fn() }));

vi.mock("../http", () => ({
  request: http.request,
  errorCode: (res: { status: number }) => `http_${res.status}`,
}));
vi.mock("expo-apple-authentication", () => ({
  signInAsync: sheet.signInAsync,
  AppleAuthenticationScope: { EMAIL: 0 },
}));

const { revokeApple } = await import("../apple-revoke");

/** What `GET /auth/v1/user` answers, with the providers this account has. */
function user(providers: string[]) {
  return {
    ok: true,
    status: 200,
    body: { identities: providers.map((provider) => ({ provider })) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sheet.signInAsync.mockResolvedValue({ authorizationCode: "code-1" });
});

test("does not show the sheet to an account that has no Apple in it", async () => {
  http.request.mockResolvedValue(user(["google"]));

  expect(await revokeApple("token")).toBe("skipped");
  expect(sheet.signInAsync).not.toHaveBeenCalled();
  expect(http.request).toHaveBeenCalledTimes(1);
});

test("does not show the sheet when it could not find out", async () => {
  // Offline. The delete that follows is about to fail on its own, and a
  // prompt nobody can act on would be the only thing the person saw.
  http.request.mockResolvedValue({ ok: false, status: 0, body: null });

  expect(await revokeApple("token")).toBe("skipped");
  expect(sheet.signInAsync).not.toHaveBeenCalled();
});

test("sends the fresh code to the function, over the caller's own token", async () => {
  http.request
    .mockResolvedValueOnce(user(["apple"]))
    .mockResolvedValueOnce({ ok: true, status: 200, body: { ok: true } });

  expect(await revokeApple("token")).toBe("done");
  expect(http.request).toHaveBeenLastCalledWith("/functions/v1/apple-revoke", {
    method: "POST",
    token: "token",
    body: { code: "code-1" },
  });
});

test("finds Apple in app_metadata when there are no identities", async () => {
  http.request
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { app_metadata: { provider: "apple", providers: ["apple"] } },
    })
    .mockResolvedValueOnce({ ok: true, status: 200, body: { ok: true } });

  expect(await revokeApple("token")).toBe("done");
});

test("a closed sheet is its own answer, and nothing is sent", async () => {
  http.request.mockResolvedValue(user(["apple"]));
  sheet.signInAsync.mockRejectedValue({ code: "ERR_REQUEST_CANCELED" });

  expect(await revokeApple("token")).toBe("cancelled");
  expect(http.request).toHaveBeenCalledTimes(1);
});

test("a sheet that broke is a failure, not a cancel", async () => {
  http.request.mockResolvedValue(user(["apple"]));
  sheet.signInAsync.mockRejectedValue({ code: "ERR_UNKNOWN" });

  // The difference decides whether the account gets deleted afterwards.
  expect(await revokeApple("token")).toBe("failed");
});

test("a sheet with no code in it is a failure", async () => {
  http.request.mockResolvedValue(user(["apple"]));
  sheet.signInAsync.mockResolvedValue({ authorizationCode: null });

  expect(await revokeApple("token")).toBe("failed");
  expect(http.request).toHaveBeenCalledTimes(1);
});

test("a function that refused is a failure", async () => {
  http.request
    .mockResolvedValueOnce(user(["apple"]))
    .mockResolvedValueOnce({ ok: false, status: 502, body: null });

  expect(await revokeApple("token")).toBe("failed");
});
