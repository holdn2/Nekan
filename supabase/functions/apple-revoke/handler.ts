/**
 * The request half of apple-revoke: who may ask, and what happens when they do.
 *
 * Split from index.ts, which is now one line, because this is where the
 * security decisions are and the other file cannot be imported outside Deno.
 * `supabase/` is in no tsconfig, so nothing here is typechecked -- test/ is the
 * only thing standing between this file and a mistake that ships.
 *
 * Deno's globals are reached through `globalThis` rather than named directly,
 * so a Node test can stand one up. Nothing else in here is Deno's.
 */

import { CALL_TIMEOUT_MS, revokeWithCode } from "./apple.ts";

type Env = { env: { get(name: string): string | undefined } };

function env(name: string): string | undefined {
  return (globalThis as { Deno?: Env }).Deno?.env.get(name);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Does this account sign in with Apple? The phone asks the same question. */
function hasApple(user: unknown): boolean {
  const fields = (user ?? {}) as {
    identities?: unknown;
    app_metadata?: { providers?: unknown; provider?: unknown };
  };
  if (Array.isArray(fields.identities))
    return fields.identities.some(
      (one) => (one as { provider?: unknown })?.provider === "apple",
    );
  const providers = fields.app_metadata?.providers;
  if (Array.isArray(providers)) return providers.includes("apple");
  return fields.app_metadata?.provider === "apple";
}

type Caller = "anonymous" | "no_apple" | "apple" | "unreachable";

/**
 * Who is asking.
 *
 * Two gates, and the second one is the load-bearing one. The platform already
 * refuses unsigned callers when a function is deployed with JWT verification
 * on, which is the default -- but that flag is a deploy-time decision made
 * elsewhere, and being wrong about it means anyone at all can spend our client
 * secret against Apple.
 *
 * "Signed in" alone is a weak gate, because signing up is open: a stranger can
 * have a valid project JWT in seconds through Google. Requiring an Apple
 * identity makes the cheapest way in an actual Apple sign-in, which Apple
 * itself rate-limits. It costs nothing extra -- this is the same request that
 * was already being made to check the JWT, now reading its answer instead of
 * throwing it away.
 *
 * It does not make abuse impossible. Somebody with an Apple-linked account can
 * still burn requests against our client id, and the damage would be Apple
 * throttling us -- which stops revocation while sign-in and sync go on
 * working, the exact silent failure this design is built to avoid. A per-user
 * cap is the next thing to add if that ever looks likely.
 *
 * Asked with the anon key, never the service role.
 */
async function callerOf(bearer: string): Promise<Caller> {
  const url = env("SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY");
  if (!url || !anon) return "anonymous";
  let res: Response;
  try {
    res = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: bearer },
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  } catch {
    // Timed out or never connected. Still a refusal -- a caller nobody could
    // check is not let through -- but named for what it is, so the log does
    // not read "not signed in" about somebody who was.
    return "unreachable";
  }
  if (!res.ok) return "anonymous";
  return hasApple(await res.json().catch(() => null)) ? "apple" : "no_apple";
}

/** The four secrets, or null naming nothing -- the log must not hold them. */
function appleKey() {
  const privateKey = env("APPLE_PRIVATE_KEY");
  const keyId = env("APPLE_KEY_ID");
  const teamId = env("APPLE_TEAM_ID");
  const clientId = env("APPLE_CLIENT_ID");
  if (!privateKey || !keyId || !teamId || !clientId) return null;
  return { privateKey, keyId, teamId, clientId };
}

export async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const bearer = req.headers.get("Authorization");
  const caller = bearer ? await callerOf(bearer) : "anonymous";
  if (caller === "anonymous") return json({ error: "not_signed_in" }, 401);
  if (caller === "no_apple") return json({ error: "not_apple" }, 403);
  if (caller === "unreachable") return json({ error: "auth_unreachable" }, 502);

  let code: unknown = null;
  try {
    code = ((await req.json()) as { code?: unknown } | null)?.code ?? null;
  } catch {
    code = null;
  }
  if (typeof code !== "string" || !code) return json({ error: "no_code" }, 400);

  const key = appleKey();
  // A missing secret is ours to fix and nobody else's to act on, so the app
  // treats this like any other failure. The name is here for whoever reads
  // the function's log afterwards, which is the only place it goes.
  if (!key) return json({ error: "not_configured" }, 500);

  try {
    const result = await revokeWithCode(key, code);
    if (!result.ok) return json({ error: result.error }, 502);
    return json({ ok: true });
  } catch {
    // A network throw, or a .p8 that is not a key. Nothing thrown here
    // carries key material, but letting it escape would answer plain-text 500
    // where every other path answers JSON.
    return json({ error: "revoke_threw" }, 502);
  }
}
