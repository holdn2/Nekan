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
 * This file is one line on purpose. Everything a test would want to reach is
 * in handler.ts, because `Deno.serve` cannot be imported outside Deno and a
 * file that cannot be imported cannot be checked.
 *
 * Deploy: supabase functions deploy apple-revoke
 * Secrets: APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY
 */

import { handle } from "./handler.ts";

Deno.serve(handle);
