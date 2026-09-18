/**
 * The client secret, and the two calls it pays for.
 *
 * The signature is the reason this file exists. Apple refuses a badly encoded
 * one as `invalid_client`, which is the same answer it gives for a key that
 * belongs to another team or an app id that does not match -- so the one
 * mistake a reader is most likely to make while editing this code is also the
 * one its error message hides best. Here the secret is signed with a key made
 * on the spot and checked against its own public half, so a broken encoder
 * fails as "the signature does not verify" instead.
 *
 * The rest pins the order: exchange the code, then revoke what it became, and
 * prefer the refresh token because revoking it takes the access token with it.
 */

import { expect, test, vi } from "vitest";
import { clientSecret, revokeWithCode, type AppleKey } from "../apple.ts";

/** A throwaway P-256 pair, as a .p8-shaped PEM plus the public half. */
async function freshKey(): Promise<{ pem: string; publicKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", pair.privateKey),
  );
  let binary = "";
  for (const byte of pkcs8) binary += String.fromCharCode(byte);
  const body = btoa(binary).replace(/(.{64})/g, "$1\n");
  return {
    pem: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`,
    publicKey: pair.publicKey,
  };
}

function decode(part: string): Record<string, unknown> {
  const padded = part.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(padded + "=".repeat((4 - (padded.length % 4)) % 4)));
}

function bytesOf(part: string): Uint8Array {
  const padded = part.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function key(): Promise<{ key: AppleKey; publicKey: CryptoKey }> {
  const { pem, publicKey } = await freshKey();
  return {
    key: {
      privateKey: pem,
      keyId: "KEYID12345",
      teamId: "TEAMID6789",
      clientId: "com.yoshi.nekan",
    },
    publicKey,
  };
}

test("signs a secret Apple's own verification would accept", async () => {
  const { key: apple, publicKey } = await key();
  const secret = await clientSecret(apple, 1_700_000_000_000);

  const [header, claims, signature] = secret.split(".");
  expect(decode(header)).toEqual({
    alg: "ES256",
    kid: "KEYID12345",
    typ: "JWT",
  });
  expect(decode(claims)).toEqual({
    iss: "TEAMID6789",
    sub: "com.yoshi.nekan",
    aud: "https://appleid.apple.com",
    iat: 1_700_000_000,
    exp: 1_700_000_300,
  });

  // The whole point: raw r || s, not DER, and base64url without padding.
  const verified = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    bytesOf(signature),
    new TextEncoder().encode(`${header}.${claims}`),
  );
  expect(verified).toBe(true);
  expect(secret).not.toContain("=");
});

test("exchanges the code, then revokes the refresh token it got", async () => {
  const { key: apple } = await key();
  const calls: { url: string; form: URLSearchParams }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, form: new URLSearchParams(String(init.body)) });
      if (url.endsWith("/auth/token"))
        return new Response(
          JSON.stringify({ refresh_token: "r1", access_token: "a1" }),
          { status: 200 },
        );
      return new Response("", { status: 200 });
    }),
  );

  await expect(revokeWithCode(apple, "code-1")).resolves.toEqual({ ok: true });

  expect(calls.map((c) => c.url)).toEqual([
    "https://appleid.apple.com/auth/token",
    "https://appleid.apple.com/auth/revoke",
  ]);
  expect(calls[0].form.get("code")).toBe("code-1");
  expect(calls[0].form.get("grant_type")).toBe("authorization_code");
  expect(calls[1].form.get("token")).toBe("r1");
  expect(calls[1].form.get("token_type_hint")).toBe("refresh_token");
  // The same secret pays for both, rather than being signed twice.
  expect(calls[0].form.get("client_secret")).toBe(
    calls[1].form.get("client_secret"),
  );
});

test("falls back to the access token when there is no refresh token", async () => {
  const { key: apple } = await key();
  const calls: URLSearchParams[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push(new URLSearchParams(String(init.body)));
      if (url.endsWith("/auth/token"))
        return new Response(JSON.stringify({ access_token: "a1" }), {
          status: 200,
        });
      return new Response("", { status: 200 });
    }),
  );

  await expect(revokeWithCode(apple, "code-1")).resolves.toEqual({ ok: true });
  expect(calls[1].get("token")).toBe("a1");
  expect(calls[1].get("token_type_hint")).toBe("access_token");
});

test("gives back Apple's own words when the exchange is refused", async () => {
  const { key: apple } = await key();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "invalid_grant" }), {
          status: 400,
        }),
    ),
  );

  await expect(revokeWithCode(apple, "spent")).resolves.toEqual({
    ok: false,
    error: "invalid_grant",
  });
});

test("does not call revoke when the exchange gave nothing to revoke", async () => {
  const { key: apple } = await key();
  const fetched = vi.fn(
    async () => new Response(JSON.stringify({ id_token: "only" })),
  );
  vi.stubGlobal("fetch", fetched);

  await expect(revokeWithCode(apple, "code-1")).resolves.toEqual({
    ok: false,
    error: "no_token",
  });
  expect(fetched).toHaveBeenCalledTimes(1);
});

test("says where a wordless failure came from", async () => {
  const { key: apple } = await key();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.endsWith("/auth/token")
        ? new Response(JSON.stringify({ refresh_token: "r1" }))
        : new Response("", { status: 503 }),
    ),
  );

  await expect(revokeWithCode(apple, "code-1")).resolves.toEqual({
    ok: false,
    error: "apple_503",
  });
});
