/**
 * Deleting the account from the phone.
 *
 * What is worth pinning down is when the session goes. Only after the server
 * has deleted the account -- otherwise the person is left signed out of an
 * account that still exists, with nothing to retry from -- and never when a
 * different session arrived while the request was out, because that one
 * belongs to an account nobody deleted.
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

vi.mock("../http", () => ({
  request: http.request,
  errorCode: (res: { status: number }) =>
    res.status === 0 ? "offline" : `http_${res.status}`,
}));
vi.mock("../session", () => session);

const { deleteAccount } = await import("../account");

beforeEach(() => {
  vi.clearAllMocks();
  session.reset();
  session.accessToken.mockResolvedValue("token");
  session.currentSession.mockReturnValue({ userId: "u1" });
});

test("asks the server first, and drops the session once it has said yes", async () => {
  http.request.mockResolvedValue({ ok: true, status: 204, body: null });

  const res = await deleteAccount();

  expect(http.request).toHaveBeenCalledWith(
    "/rest/v1/rpc/delete_account",
    expect.objectContaining({ method: "POST", token: "token" }),
  );
  expect(session.dropSession).toHaveBeenCalledTimes(1);
  expect(res).toEqual({ ok: true, signedOut: true });
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
  expect(res).toEqual({ ok: true, signedOut: false });
});
