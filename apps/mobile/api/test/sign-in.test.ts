/**
 * Sign in with Apple: what goes to Apple, what goes to Supabase, and when a
 * session is kept.
 *
 * The nonce is the part worth a test. It travels twice in two forms -- hashed
 * to Apple, raw to Supabase -- and swapping them, or sending one string to
 * both, fails every single sign-in with an error that reads like Apple being
 * down. None of it can be tried on a device before a build, and a build is the
 * expensive thing here, so it is pinned down before one is spent.
 */

import { createHash } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";

const apple = vi.hoisted(() => ({
  signInAsync: vi.fn(),
  isAvailableAsync: vi.fn(),
}));
const http = vi.hoisted(() => ({ request: vi.fn() }));
const session = vi.hoisted(() => ({
  adoptSession: vi.fn(async () => {}),
  sessionEpoch: vi.fn(() => 1),
}));

vi.mock("expo-apple-authentication", () => ({
  signInAsync: apple.signInAsync,
  isAvailableAsync: apple.isAvailableAsync,
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

// The real digest, so the test checks the hash that will actually be sent.
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  CryptoEncoding: { HEX: "hex", BASE64: "base64" },
  getRandomBytesAsync: async (n: number) =>
    Uint8Array.from({ length: n }, (_, i) => i),
  digestStringAsync: async (
    _alg: string,
    data: string,
    opts?: { encoding?: "hex" | "base64" },
  ) =>
    createHash("sha256")
      .update(data)
      .digest(opts?.encoding ?? "hex"),
}));

// Imported by the Google path at module load; nothing here opens a browser.
vi.mock("expo-web-browser", () => ({ openAuthSessionAsync: vi.fn() }));
vi.mock("expo-auth-session", () => ({ makeRedirectUri: () => "nekan://auth" }));

vi.mock("../http", () => ({
  request: http.request,
  errorCode: (res: { status: number; body?: { error_code?: string } }) =>
    res.status === 0
      ? "offline"
      : (res.body?.error_code ?? `http_${res.status}`),
}));
vi.mock("../session", () => session);

const { signInWithApple, appleSignInAvailable } = await import("../sign-in");

const TOKENS = {
  access_token: "access",
  refresh_token: "refresh",
  expires_in: 3600,
  user: { id: "u1", email: "person@example.com" },
};

beforeEach(() => {
  vi.clearAllMocks();
  session.sessionEpoch.mockReturnValue(1);
  apple.signInAsync.mockResolvedValue({ identityToken: "apple.id.token" });
  http.request.mockResolvedValue({ ok: true, status: 200, body: TOKENS });
});

test("Apple gets the hash of the nonce, Supabase gets the nonce itself", async () => {
  const res = await signInWithApple();
  expect(res.ok).toBe(true);

  const sentToApple = apple.signInAsync.mock.calls[0][0].nonce as string;
  const [path, init] = http.request.mock.calls[0];
  const sentToSupabase = init.body.nonce as string;

  expect(path).toBe("/auth/v1/token?grant_type=id_token");
  expect(init.body.provider).toBe("apple");
  expect(init.body.id_token).toBe("apple.id.token");
  // Supabase hashes what it is given and compares with the token's claim, so
  // this relation -- lowercase hex SHA-256 -- is the whole contract.
  expect(sentToApple).toBe(
    createHash("sha256").update(sentToSupabase).digest("hex"),
  );
  expect(sentToApple).not.toBe(sentToSupabase);
});

test("only the email scope is asked for", async () => {
  await signInWithApple();
  expect(apple.signInAsync.mock.calls[0][0].requestedScopes).toEqual([1]);
});

test("a session from the exchange is kept", async () => {
  const res = await signInWithApple();
  expect(session.adoptSession).toHaveBeenCalledTimes(1);
  expect(res).toEqual({
    ok: true,
    session: { email: "person@example.com", userId: "u1" },
  });
});

test("closing the sheet is a cancel, and nothing reaches the server", async () => {
  apple.signInAsync.mockRejectedValue({ code: "ERR_REQUEST_CANCELED" });
  expect(await signInWithApple()).toEqual({ ok: false, error: "cancelled" });
  expect(http.request).not.toHaveBeenCalled();
});

test("any other failure of the sheet is reported as Apple's", async () => {
  apple.signInAsync.mockRejectedValue(new Error("boom"));
  expect(await signInWithApple()).toEqual({ ok: false, error: "apple_failed" });
  expect(http.request).not.toHaveBeenCalled();
});

test("a credential without a token is not sent on", async () => {
  apple.signInAsync.mockResolvedValue({ identityToken: null });
  expect(await signInWithApple()).toEqual({ ok: false, error: "bad_response" });
  expect(http.request).not.toHaveBeenCalled();
});

test("the server's refusal comes back as its code", async () => {
  // What this project answered before the provider was switched on.
  http.request.mockResolvedValue({
    ok: false,
    status: 400,
    body: { error_code: "provider_disabled" },
  });
  expect(await signInWithApple()).toEqual({
    ok: false,
    error: "provider_disabled",
  });
  expect(session.adoptSession).not.toHaveBeenCalled();
});

test("a sign-out while the sheet was up wins over the sign-in", async () => {
  session.sessionEpoch.mockReturnValueOnce(1).mockReturnValue(2);
  expect(await signInWithApple()).toEqual({ ok: false, error: "cancelled" });
  expect(session.adoptSession).not.toHaveBeenCalled();
});

test("a device that cannot answer is treated as one without Apple", async () => {
  apple.isAvailableAsync.mockRejectedValue(new Error("no module"));
  expect(await appleSignInAvailable()).toBe(false);
  apple.isAvailableAsync.mockResolvedValue(true);
  expect(await appleSignInAvailable()).toBe(true);
});
