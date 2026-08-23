/**
 * The ways in.
 *
 * Google is the only one the shipped app offers. The password pair below still
 * exists because sync has to be testable without a person clicking a consent
 * screen, and ipc.ts registers it only outside a packaged build -- removing it
 * would leave no way to verify syncing automatically.
 */

import { publicSession, sessionFromToken } from "../../shared/auth";
import { canStore } from "../token-store";
import { loopbackCode, pkcePair } from "../oauth";
import { SUPABASE_URL, request, errorCode } from "./http";
import { remember, logoutEpoch } from "./session";

/**
 * Sign in with Google: consent in the real browser, tokens back here.
 *
 * This is the only way in that the shipped app offers. The password pair below
 * still exists because sync has to be testable without a person clicking a
 * consent screen, but ipc.js only registers it outside a packaged build.
 */
async function loginWithGoogle() {
  if (!canStore()) return { ok: false, error: "no_secure_storage" };

  // A logout that lands while the browser is still open ends this attempt too:
  // the user's last word on being signed in was "log out", and storing a
  // session afterwards would quietly undo it.
  const startedAt = logoutEpoch();

  const { verifier, challenge } = pkcePair();
  const back = await loopbackCode(
    (redirect) =>
      `${SUPABASE_URL}/auth/v1/authorize?provider=google` +
      `&redirect_to=${encodeURIComponent(redirect)}` +
      `&code_challenge=${challenge}&code_challenge_method=s256`,
  );
  if (back.ok !== true) return { ok: false, error: back.error };

  const res = await request("/auth/v1/token?grant_type=pkce", {
    method: "POST",
    body: { auth_code: back.code, code_verifier: verifier },
  });
  if (!res.ok) return { ok: false, error: errorCode(res) };

  const next = sessionFromToken(res.body, Date.now());
  if (!next) return { ok: false, error: "bad_response" };
  if (logoutEpoch() !== startedAt) return { ok: false, error: "cancelled" };
  remember(next);
  return { ok: true, session: publicSession(next) };
}

async function login(email: string, password: string) {
  // Checked before the request, not after: a successful login we cannot store
  // is a login that vanishes on restart, and the user would have no idea why.
  if (!canStore()) return { ok: false, error: "no_secure_storage" };
  const startedAt = logoutEpoch();

  const res = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  if (!res.ok) return { ok: false, error: errorCode(res) };

  const next = sessionFromToken(res.body, Date.now());
  if (!next) return { ok: false, error: "bad_response" };
  if (logoutEpoch() !== startedAt) return { ok: false, error: "cancelled" };
  remember(next);
  return { ok: true, session: publicSession(next) };
}

/**
 * Sign up, and log in with it when the project allows.
 *
 * Whether a session comes back depends on a project setting: with email
 * confirmation off it does, with it on the account exists but is unusable
 * until a link is clicked. Both are reported rather than one being assumed --
 * that setting is going to be turned on before launch.
 */
async function signup(email: string, password: string) {
  if (!canStore()) return { ok: false, error: "no_secure_storage" };

  const res = await request("/auth/v1/signup", {
    method: "POST",
    body: { email, password },
  });
  if (!res.ok) return { ok: false, error: errorCode(res) };

  const next = sessionFromToken(res.body, Date.now());
  if (!next) return { ok: true, session: null, confirmationRequired: true };
  remember(next);
  return {
    ok: true,
    session: publicSession(next),
    confirmationRequired: false,
  };
}

/**
 * Ask the server to end a session we have already thrown away locally.
 *
 * Renews first when the access token is spent, because /auth/v1/logout answers
 * a stale one with a 401 and does nothing -- which would leave the refresh
 * token alive on the server after a logout, and anyone holding a copy of
 * auth.json still inside the account. The renewal is deliberately a plain
 * request rather than refreshSession(): that path stores what it gets, and
 * this session is on its way out.
 */

export { loginWithGoogle, login, signup };
