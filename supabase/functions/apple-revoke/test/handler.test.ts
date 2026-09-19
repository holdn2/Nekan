/**
 * Who may spend our Apple client secret, and what each refusal looks like.
 *
 * This file exists because `supabase/` is in no tsconfig and `index.ts` cannot
 * be imported outside Deno -- so before handler.ts was split out, the one file
 * holding the security decision was also the one file nothing checked. Invert
 * the gate or misspell a secret's name and every check in the repo stayed
 * green.
 *
 * Deno's globals are stood up here rather than mocked away: `handler.ts`
 * reaches them through `globalThis`, which is exactly so this is possible.
 */

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { handle } from "../handler.ts";

/** Not a key. One test sets this deliberately to see what a throw becomes. */
const RUBBISH_KEY =
  "-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----";

/** A real throwaway P-256 key, so the signing step runs for real in here. */
async function freshPem(): Promise<string> {
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
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`;
}

const SECRETS = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  APPLE_CLIENT_ID: "com.yoshi.nekan",
  APPLE_TEAM_ID: "TEAMID6789",
  APPLE_KEY_ID: "KEYID12345",
  APPLE_PRIVATE_KEY: await freshPem(),
};

let env: Record<string, string>;

function stubDeno() {
  vi.stubGlobal("Deno", { env: { get: (name: string) => env[name] } });
}

function ask(body: unknown = { code: "code-1" }, headers: HeadersInit = {}) {
  return new Request("https://project.supabase.co/functions/v1/apple-revoke", {
    method: "POST",
    headers: { Authorization: "Bearer caller", ...headers },
    body: JSON.stringify(body),
  });
}

/** Apple's two calls, both happy, after whatever `/auth/v1/user` answered. */
function appleSaysYes(user: unknown) {
  return vi.fn(async (url: string) => {
    if (url.includes("/auth/v1/user"))
      return new Response(JSON.stringify(user), { status: 200 });
    if (url.endsWith("/auth/token"))
      return new Response(JSON.stringify({ refresh_token: "r1" }));
    return new Response("", { status: 200 });
  });
}

const appleUser = { identities: [{ provider: "apple" }] };

beforeEach(() => {
  env = { ...SECRETS };
  stubDeno();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("refuses anything that is not a POST", async () => {
  const res = await handle(new Request("https://x/", { method: "GET" }));

  expect(res.status).toBe(405);
  await expect(res.json()).resolves.toEqual({ error: "method_not_allowed" });
});

test("refuses a caller with no Authorization at all", async () => {
  const fetched = vi.fn();
  vi.stubGlobal("fetch", fetched);

  const res = await handle(
    new Request("https://x/", { method: "POST", body: "{}" }),
  );

  expect(res.status).toBe(401);
  // Nothing was asked of anybody. This is the cheapest refusal there is.
  expect(fetched).not.toHaveBeenCalled();
});

test("refuses a bearer the project does not recognise", async () => {
  // What the anon key itself gets: a valid apikey is not a signed-in person.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({}), { status: 403 })),
  );

  const res = await handle(ask());

  expect(res.status).toBe(401);
  await expect(res.json()).resolves.toEqual({ error: "not_signed_in" });
});

test("refuses a signed-in caller who does not sign in with Apple", async () => {
  // Signing up is open, so "signed in" alone is seconds of work for a
  // stranger. Without this, any of them could spend our client secret.
  const fetched = appleSaysYes({ identities: [{ provider: "google" }] });
  vi.stubGlobal("fetch", fetched);

  const res = await handle(ask());

  expect(res.status).toBe(403);
  await expect(res.json()).resolves.toEqual({ error: "not_apple" });
  // Asked who they are, and stopped. Apple was never spoken to.
  expect(fetched).toHaveBeenCalledTimes(1);
});

test("reads the caller's providers when there are no identities", async () => {
  vi.stubGlobal(
    "fetch",
    appleSaysYes({ app_metadata: { provider: "email", providers: ["apple"] } }),
  );

  await expect(handle(ask())).resolves.toMatchObject({ status: 200 });
});

test("reads the caller's lone provider when there is no list either", async () => {
  vi.stubGlobal("fetch", appleSaysYes({ app_metadata: { provider: "apple" } }));

  await expect(handle(ask())).resolves.toMatchObject({ status: 200 });
});

test("refuses a body with no code in it", async () => {
  vi.stubGlobal("fetch", appleSaysYes(appleUser));

  const res = await handle(ask({ nope: 1 }));

  expect(res.status).toBe(400);
  await expect(res.json()).resolves.toEqual({ error: "no_code" });
});

test("refuses a body that is not JSON", async () => {
  vi.stubGlobal("fetch", appleSaysYes(appleUser));

  const res = await handle(
    new Request("https://x/", {
      method: "POST",
      headers: { Authorization: "Bearer caller" },
      body: "not json",
    }),
  );

  expect(res.status).toBe(400);
});

test("says so plainly when a secret is missing, rather than signing nothing", async () => {
  delete env.APPLE_PRIVATE_KEY;
  vi.stubGlobal("fetch", appleSaysYes(appleUser));

  const res = await handle(ask());

  expect(res.status).toBe(500);
  await expect(res.json()).resolves.toEqual({ error: "not_configured" });
});

test("fails closed when the platform did not inject its own variables", async () => {
  delete env.SUPABASE_ANON_KEY;
  const fetched = vi.fn();
  vi.stubGlobal("fetch", fetched);

  const res = await handle(ask());

  // Not a 500 that lets the request through: no way to check the caller means
  // no caller is good enough.
  expect(res.status).toBe(401);
  expect(fetched).not.toHaveBeenCalled();
});

test("passes Apple's refusal through as a 502", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.includes("/auth/v1/user")
        ? new Response(JSON.stringify(appleUser), { status: 200 })
        : new Response(JSON.stringify({ error: "invalid_grant" }), {
            status: 400,
          }),
    ),
  );

  const res = await handle(ask());

  expect(res.status).toBe(502);
  await expect(res.json()).resolves.toEqual({ error: "invalid_grant" });
});

test("answers JSON even when the revoke threw", async () => {
  // A .p8 that is not a key reaches importKey and rejects. Every other path
  // answers JSON, and a plain-text 500 here would break that contract.
  env.APPLE_PRIVATE_KEY = RUBBISH_KEY;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(appleUser), { status: 200 })),
  );

  const res = await handle(ask());

  expect(res.status).toBe(502);
  await expect(res.json()).resolves.toEqual({ error: "revoke_threw" });
});

test("carries the caller's own bearer to the project, with the anon key", async () => {
  const fetched = appleSaysYes(appleUser);
  vi.stubGlobal("fetch", fetched);

  await handle(ask());

  const [url, init] = fetched.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("https://project.supabase.co/auth/v1/user");
  expect(init.headers).toEqual({
    apikey: "anon-key",
    Authorization: "Bearer caller",
  });
});

test("refuses, by name, when the caller could not be checked in time", async () => {
  // A hung auth server must not become a plain-text 500 escaping the handler,
  // nor a "not signed in" about somebody who was.
  const fetched = vi.fn(async () => {
    throw new DOMException("The operation timed out.", "TimeoutError");
  });
  vi.stubGlobal("fetch", fetched);

  const res = await handle(ask());

  expect(res.status).toBe(502);
  await expect(res.json()).resolves.toEqual({ error: "auth_unreachable" });
  expect(fetched).toHaveBeenCalledTimes(1);
});

test("puts a time limit on every outside call it makes", async () => {
  const fetched = appleSaysYes(appleUser);
  vi.stubGlobal("fetch", fetched);

  await expect(handle(ask())).resolves.toMatchObject({ status: 200 });

  // The caller check, the exchange and the revoke: three calls, each bounded,
  // so the worst case stays inside the fifteen seconds the phone will wait.
  expect(fetched).toHaveBeenCalledTimes(3);
  for (const [, init] of fetched.mock.calls as unknown as [
    string,
    RequestInit,
  ][])
    expect(init.signal).toBeInstanceOf(AbortSignal);
});
