/**
 * Deleting the account from the phone.
 *
 * What is worth pinning down is when the session goes. Only after the server
 * has deleted the account -- otherwise the person is left signed out of an
 * account that still exists, with nothing to retry from -- and never when a
 * different session arrived while the request was out, because that one
 * belongs to an account nobody deleted.
 *
 * Apple's revoke is mocked rather than exercised -- it has its own file -- but
 * its three answers are pinned here, because what they mean is "stop", "say so
 * afterwards" and "nothing to say", and only this file can see the difference.
 */

import { beforeEach, expect, test, vi } from "vitest";

const http = vi.hoisted(() => ({ request: vi.fn() }));
const session = vi.hoisted(() => {
  let epoch = 1;
  return {
    accessToken: vi.fn(async (): Promise<string | null> => "token"),
    currentSession: vi.fn((): { userId: string } | null => ({ userId: "u1" })),
    dropSession: vi.fn(async () => {}),
    refreshTokenFor: vi.fn(() => "refresh"),
    sessionEpoch: vi.fn(() => epoch),
    /** A sign-out and a sign-in happening while a request is out. */
    replace: () => {
      epoch += 1;
    },
    reset: () => {
      epoch = 1;
    },
  };
});

const apple = vi.hoisted(() => ({
  revokeApple: vi.fn(async (): Promise<string> => "skipped"),
}));

vi.mock("../http", () => ({
  request: http.request,
  errorCode: (res: { status: number }) =>
    res.status === 0 ? "offline" : `http_${res.status}`,
}));
vi.mock("../session", () => session);
vi.mock("../apple-revoke", () => ({ revokeApple: apple.revokeApple }));

const { deleteAccount } = await import("../account");

beforeEach(() => {
  vi.clearAllMocks();
  session.reset();
  session.accessToken.mockResolvedValue("token");
  session.currentSession.mockReturnValue({ userId: "u1" });
  apple.revokeApple.mockResolvedValue("skipped");
});

test("asks the server first, and drops the session once it has said yes", async () => {
  http.request.mockResolvedValue({ ok: true, status: 204, body: null });

  const res = await deleteAccount();

  expect(http.request).toHaveBeenCalledWith(
    "/rest/v1/rpc/delete_account",
    expect.objectContaining({ method: "POST", token: "token" }),
  );
  expect(session.dropSession).toHaveBeenCalledTimes(1);
  expect(res).toEqual({ ok: true, signedOut: true, apple: null });
});

test("keeps the session when the server refuses", async () => {
  http.request.mockResolvedValue({ ok: false, status: 500, body: null });

  const res = await deleteAccount();

  expect(session.dropSession).not.toHaveBeenCalled();
  expect(res).toEqual({ ok: false, error: "http_500" });
});

test("says offline, not signed out, when a renewal failed on the network", async () => {
  // The session is still there: a network failure keeps it on purpose.
  session.accessToken.mockResolvedValue(null);

  const res = await deleteAccount();

  expect(http.request).not.toHaveBeenCalled();
  expect(res).toEqual({ ok: false, error: "offline" });
});

test("says no_session when nobody is signed in any more", async () => {
  session.accessToken.mockResolvedValue(null);
  session.currentSession.mockReturnValue(null);

  expect(await deleteAccount()).toEqual({ ok: false, error: "no_session" });
});

test("leaves alone a session that arrived while the request was out", async () => {
  http.request.mockImplementation(async () => {
    session.replace();
    return { ok: true, status: 204, body: null };
  });

  const res = await deleteAccount();

  expect(session.dropSession).not.toHaveBeenCalled();
  expect(res).toEqual({ ok: true, signedOut: false, apple: null });
});

test("does not delete anything when the Apple sheet was closed", async () => {
  apple.revokeApple.mockResolvedValue("cancelled");
  http.request.mockResolvedValue({ ok: true, status: 204, body: null });

  const res = await deleteAccount();

  // The account is still standing. That is the whole point of the answer.
  expect(http.request).not.toHaveBeenCalled();
  expect(session.dropSession).not.toHaveBeenCalled();
  expect(res).toEqual({ ok: false, error: "cancelled" });
});

test("deletes anyway when the revoke failed, and says the link is still there", async () => {
  apple.revokeApple.mockResolvedValue("failed");
  http.request.mockResolvedValue({ ok: true, status: 204, body: null });

  const res = await deleteAccount();

  // A revoke we cannot perform must never become an account nobody can leave.
  expect(res).toEqual({ ok: true, signedOut: true, apple: "kept" });
});

test("deletes anyway when it could not find out, and says so conditionally", async () => {
  // Could not ask whether this was an Apple account. The delete goes ahead
  // like every other failure, but the screen gets to say "if you used Apple"
  // instead of nothing -- folding this into "nothing to revoke" would leave an
  // Apple link standing with nobody told.
  apple.revokeApple.mockResolvedValue("unknown");
  http.request.mockResolvedValue({ ok: true, status: 204, body: null });

  expect(await deleteAccount()).toEqual({
    ok: true,
    signedOut: true,
    apple: "unknown",
  });
});

test("revokes before it deletes", async () => {
  const order: string[] = [];
  apple.revokeApple.mockImplementation(async () => {
    order.push("revoke");
    return "done";
  });
  http.request.mockImplementation(async () => {
    order.push("delete");
    return { ok: true, status: 204, body: null };
  });

  const res = await deleteAccount();

  // The recoverable order. The other way round leaves an Apple link with no
  // account behind it, and no screen in this app can reach that.
  expect(order).toEqual(["revoke", "delete"]);
  expect(res).toEqual({ ok: true, signedOut: true, apple: null });
});

test("spends a token fetched after the sheet, not the one from before it", async () => {
  session.accessToken
    .mockResolvedValueOnce("old")
    .mockResolvedValueOnce("renewed");
  http.request.mockResolvedValue({ ok: true, status: 204, body: null });

  await deleteAccount();

  expect(http.request).toHaveBeenCalledWith(
    "/rest/v1/rpc/delete_account",
    expect.objectContaining({ token: "renewed" }),
  );
});

test("does not delete with a token that died while the sheet was up", async () => {
  session.accessToken.mockResolvedValueOnce("old").mockResolvedValueOnce(null);
  http.request.mockResolvedValue({ ok: true, status: 204, body: null });

  const res = await deleteAccount();

  expect(http.request).not.toHaveBeenCalled();
  expect(res).toEqual({ ok: false, error: "offline" });
});
