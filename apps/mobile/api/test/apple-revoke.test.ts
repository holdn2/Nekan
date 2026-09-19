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
const sheet = vi.hoisted(() => ({
  signInAsync: vi.fn(),
  isAvailableAsync: vi.fn(),
}));
const session = vi.hoisted(() => ({ accessToken: vi.fn() }));

vi.mock("../http", () => ({
  request: http.request,
  errorCode: (res: { status: number }) => `http_${res.status}`,
}));
vi.mock("expo-apple-authentication", () => ({
  signInAsync: sheet.signInAsync,
  isAvailableAsync: sheet.isAvailableAsync,
  AppleAuthenticationScope: { EMAIL: 0 },
}));
vi.mock("../session", () => ({ accessToken: session.accessToken }));

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
  // Reset, not clear. `clearAllMocks` leaves `mockResolvedValueOnce` queues
  // standing, so a test that returns early hands its unspent reply to the
  // next one -- which then fails while pointing at innocent code.
  http.request.mockReset();
  sheet.signInAsync.mockReset();
  sheet.isAvailableAsync.mockReset();
  session.accessToken.mockReset();
  sheet.isAvailableAsync.mockResolvedValue(true);
  sheet.signInAsync.mockResolvedValue({ authorizationCode: "code-1" });
  session.accessToken.mockResolvedValue("token");
});

test("does not show the sheet on a device that has no Apple sign-in", async () => {
  // Android. The sheet would reject with an availability error, which is not
  // a cancel, so without this the person would be told to clear an Apple link
  // in a Settings app they do not have.
  sheet.isAvailableAsync.mockResolvedValue(false);

  expect(await revokeApple()).toBe("skipped");
  expect(http.request).not.toHaveBeenCalled();
});

test("does nothing when there is no session left to ask with", async () => {
  session.accessToken.mockResolvedValue(null);

  expect(await revokeApple()).toBe("skipped");
  expect(sheet.signInAsync).not.toHaveBeenCalled();
});

test("asks again for a token after the sheet, and sends that one", async () => {
  // A person can stand in front of the sheet for longer than the minute
  // `accessToken()` renews inside, so the token taken before it can be dead.
  session.accessToken
    .mockResolvedValueOnce("old")
    .mockResolvedValueOnce("renewed");
  http.request
    .mockResolvedValueOnce(user(["apple"]))
    .mockResolvedValueOnce({ ok: true, status: 200, body: { ok: true } });

  expect(await revokeApple()).toBe("done");
  expect(http.request).toHaveBeenLastCalledWith("/functions/v1/apple-revoke", {
    method: "POST",
    token: "renewed",
    body: { code: "code-1" },
  });
});

test("is a failure, not a silent success, when the token died under the sheet", async () => {
  session.accessToken.mockResolvedValueOnce("old").mockResolvedValueOnce(null);
  http.request.mockResolvedValue(user(["apple"]));

  expect(await revokeApple()).toBe("failed");
  expect(http.request).toHaveBeenCalledTimes(1);
});

test("does not show the sheet to an account that has no Apple in it", async () => {
  http.request.mockResolvedValue(user(["google"]));

  expect(await revokeApple()).toBe("skipped");
  expect(sheet.signInAsync).not.toHaveBeenCalled();
  expect(http.request).toHaveBeenCalledTimes(1);
});

test("does not show the sheet when it could not find out, and says so", async () => {
  // Face ID for somebody who may have signed in with Google would be alarming,
  // so no sheet. But "unknown" is not "skipped": the screen has to be able to
  // say an Apple link may be left, or that case vanishes without a word.
  http.request.mockResolvedValue({ ok: false, status: 503, body: null });

  expect(await revokeApple()).toBe("unknown");
  expect(sheet.signInAsync).not.toHaveBeenCalled();
});

test("sends the fresh code to the function, over the caller's own token", async () => {
  http.request
    .mockResolvedValueOnce(user(["apple"]))
    .mockResolvedValueOnce({ ok: true, status: 200, body: { ok: true } });

  expect(await revokeApple()).toBe("done");
  expect(http.request).toHaveBeenLastCalledWith("/functions/v1/apple-revoke", {
    method: "POST",
    token: "token",
    body: { code: "code-1" },
  });
});

test("falls back to the providers list when there are no identities", async () => {
  http.request
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { app_metadata: { provider: "email", providers: ["apple"] } },
    })
    .mockResolvedValueOnce({ ok: true, status: 200, body: { ok: true } });

  expect(await revokeApple()).toBe("done");
});

test("falls back to the lone provider when there is no list either", async () => {
  // Split from the case above on purpose: a body carrying both shapes lets
  // either branch alone satisfy it, so neither one is actually tested.
  http.request
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { app_metadata: { provider: "apple" } },
    })
    .mockResolvedValueOnce({ ok: true, status: 200, body: { ok: true } });

  expect(await revokeApple()).toBe("done");
});

test("a closed sheet is its own answer, and nothing is sent", async () => {
  http.request.mockResolvedValue(user(["apple"]));
  sheet.signInAsync.mockRejectedValue({ code: "ERR_REQUEST_CANCELED" });

  expect(await revokeApple()).toBe("cancelled");
  expect(http.request).toHaveBeenCalledTimes(1);
});

test("a sheet that broke is a failure, not a cancel", async () => {
  http.request.mockResolvedValue(user(["apple"]));
  sheet.signInAsync.mockRejectedValue({ code: "ERR_UNKNOWN" });

  // The difference decides whether the account gets deleted afterwards.
  expect(await revokeApple()).toBe("failed");
});

test("a sheet with no code in it is a failure", async () => {
  http.request.mockResolvedValue(user(["apple"]));
  sheet.signInAsync.mockResolvedValue({ authorizationCode: null });

  expect(await revokeApple()).toBe("failed");
  expect(http.request).toHaveBeenCalledTimes(1);
});

test("a function that refused is a failure", async () => {
  http.request
    .mockResolvedValueOnce(user(["apple"]))
    .mockResolvedValueOnce({ ok: false, status: 502, body: null });

  expect(await revokeApple()).toBe("failed");
});
