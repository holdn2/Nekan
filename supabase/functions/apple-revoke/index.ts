/**
 * Revoke one person's Sign in with Apple tokens.
 *
 * Why this exists at all: Apple's account-deletion guidance for 5.1.1(v) says
 * an app that offers Sign in with Apple "should use the Sign in with Apple
 * REST API to revoke user tokens", Supabase does not do it for us (its Apple
 * provider has no revoke path), and the REST API needs a client secret signed
 * with the .p8 key. That key cannot ship in an app, so it has to be a server,
 * and this is the smallest server that does only that.
 *
 * What it does *not* do is as deliberate. It stores nothing -- the app sends a
 * fresh authorization code and the tokens it becomes never outlive the
 * request. It never touches the database, so it wants no `service_role` key:
 * the account row is deleted by `delete_account()` over the caller's own JWT,
 * exactly as before. Deleting and revoking stay two calls for that reason.
 *
 * Order matters and the app owns it: revoke first, delete second. Revoked but
 * not deleted leaves an account the next Apple sign-in rejoins; deleted but
 * not revoked leaves an Apple connection with nothing behind it, which nobody
 * can clear from inside the app.
 *
 * Deploy: supabase functions deploy apple-revoke
 * Secrets: APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY
 */

import { revokeWithCode } from "./apple.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Is the caller a signed-in user of this project?
 *
 * The platform already refuses unsigned callers when a function is deployed
 * with JWT verification on, which is the default. This asks anyway, because
 * the flag is a deploy-time decision made elsewhere and the cost of being
 * wrong about it is an endpoint that lets anyone spend our client secret
 * against Apple. It asks with the anon key, never the service role.
 */
async function callerIsSignedIn(bearer: string): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return false;
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: bearer },
  });
  return res.ok;
}

/** The four secrets, or null naming nothing -- the log must not hold them. */
function appleKey() {
  const privateKey = Deno.env.get("APPLE_PRIVATE_KEY");
  const keyId = Deno.env.get("APPLE_KEY_ID");
  const teamId = Deno.env.get("APPLE_TEAM_ID");
  const clientId = Deno.env.get("APPLE_CLIENT_ID");
  if (!privateKey || !keyId || !teamId || !clientId) return null;
  return { privateKey, keyId, teamId, clientId };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const bearer = req.headers.get("Authorization");
  if (!bearer || !(await callerIsSignedIn(bearer)))
    return json({ error: "not_signed_in" }, 401);

  let code: unknown = null;
  try {
    code = ((await req.json()) as { code?: unknown } | null)?.code ?? null;
  } catch {
    code = null;
  }
  if (typeof code !== "string" || !code) return json({ error: "no_code" }, 400);

  const key = appleKey();
  // A missing secret is ours to fix, and the app is told so plainly: it has
  // to tell the difference between "try again" and "this will never work",
  // because it is about to delete the account either way.
  if (!key) return json({ error: "not_configured" }, 500);

  const result = await revokeWithCode(key, code);
  if (!result.ok) return json({ error: result.error }, 502);
  return json({ ok: true });
});
