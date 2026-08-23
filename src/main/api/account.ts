/**
 * The ways out: signing out of this device, and deleting the account.
 *
 * Logging out is something the user has decided, so it happens here first and
 * the revoke follows -- a network that is down cannot be allowed to keep
 * somebody signed in. And it is `?scope=local`: the endpoint defaults to
 * global, which would end the session on every device the account has.
 */

import type { Session } from "../../shared/types";
import { needsRefresh, sessionFromToken } from "../../shared/auth";
import { request, errorCode } from "./http";
import {
  forget,
  getAccessToken,
  currentSession,
  refreshInFlight,
  logoutEpoch,
} from "./session";

async function revoke(
  previous: Session | null,
  inFlight: Promise<Session | null> | null,
) {
  // A renewal that was already running holds this same refresh token, and
  // rotation means a second exchange would invalidate one of the two -- the
  // race refreshSession()'s single flight exists to prevent. Rather than
  // start one, stand down: the token it fetched is already orphaned by the
  // logout and expires on its own, which is the same outcome as revoking
  // while offline.
  if (inFlight) {
    await inFlight.catch(() => {});
    return;
  }
  // Nothing to revoke. Reached when logout runs with no session, which the
  // caller already treats as success -- being signed out is the outcome.
  if (!previous) return;

  let token: string | null = previous.accessToken;
  if (needsRefresh(previous, Date.now())) {
    const res = await request("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: { refresh_token: previous.refreshToken },
    });
    const renewed = res.ok ? sessionFromToken(res.body, Date.now()) : null;
    token = renewed ? renewed.accessToken : null;
  }

  // `scope=local` ends this session and no other. The default is `global`,
  // which revokes every refresh token the account has -- so logging out on the
  // laptop would sign the phone out too. On an app whose whole point is being
  // signed in on more than one machine, that is the wrong default.
  if (token) {
    await request("/auth/v1/logout?scope=local", { method: "POST", token });
  }
}

/**
 * Log out here first, then ask the server to revoke.
 *
 * That order is the point: logging out is something a user has decided, and it
 * cannot be allowed to fail because the network did. The revoke is not awaited
 * for the same reason -- offline it would sit on the request timeout while the
 * user watches a button that has already done its job. If it never lands, the
 * refresh token expires on its own.
 */
async function logout() {
  const previous = currentSession();
  // Captured before forget(), which does not stop a renewal already running.
  const inFlight = refreshInFlight();
  forget();
  if (previous) revoke(previous, inFlight).catch(() => {});
  return { ok: true };
}

/**
 * Delete the account on the server, then sign out here.
 *
 * The opposite order from logout(), and for the opposite reason. Logging out is
 * a local decision the network is not allowed to veto; deleting an account is
 * something only the server can do, so there is nothing to report until it has
 * said yes. Signing out first would leave the user with no session to retry
 * from and an account still standing.
 *
 * `delete_account()` takes no argument -- it reads auth.uid() -- so there is no
 * way to name somebody else's account, and the rows go with it through the
 * foreign key. No /auth/v1/logout afterwards: the user row is gone and every
 * session on it with it, so there is nothing left to revoke.
 */
async function deleteAccount() {
  const token = await getAccessToken();
  if (!token) {
    // Two very different states arrive here, and telling them apart is the
    // difference between a true sentence and a false one. A renewal that failed
    // on the network leaves the session in place by design -- the user is still
    // signed in, and answering "no_session" sends them off to log in again over
    // what is really a dead connection. Only a 4xx renewal actually throws the
    // session away, and that is the one that has no account to delete.
    return { ok: false, error: currentSession() ? "offline" : "no_session" };
  }

  // The same guard runRefresh() takes, for the same reason. Logging out and
  // back in while this request is in flight leaves a *different* session here,
  // and forgetting that one would sign somebody out of an account that was
  // never deleted. `signedOut` is what it comes to: the delete happened either
  // way, but only the caller that still owns the session may act on it.
  const startedAt = logoutEpoch();
  const current = currentSession();

  const res = await request("/rest/v1/rpc/delete_account", {
    method: "POST",
    token,
    body: {},
  });
  if (!res.ok) return { ok: false, error: errorCode(res) };

  const stillOurs = logoutEpoch() === startedAt && currentSession() === current;
  if (stillOurs) forget();
  return { ok: true, signedOut: stillOurs };
}

export { logout, deleteAccount };
