/**
 * Signing out.
 *
 * Two things matter here and both are the desktop's, for the same reasons.
 *
 * It is `?scope=local`. The endpoint defaults to global, which would end the
 * session on *every* device the account has -- and using more than one device
 * is the entire point of the feature. Signing out on a phone must not sign
 * out the laptop.
 *
 * And the local session goes whatever the server says. A revoke that fails
 * because the network is down still has to leave the person signed out on
 * this device, or "sign out" would be a button that sometimes does nothing.
 * The token it could not revoke expires on its own.
 */
import {
  accessToken,
  currentSession,
  dropSession,
  refreshTokenFor,
  sessionEpoch,
} from "./session";
import { errorCode, request } from "./http";

export async function signOut(): Promise<void> {
  const marker = sessionEpoch();
  const refresh = refreshTokenFor(marker);
  const token = await accessToken();

  // Local first would be tidier to read, but the revoke needs the credentials
  // that dropping the session throws away.
  if (token && refresh) {
    await request("/auth/v1/logout?scope=local", {
      method: "POST",
      token,
      body: { refresh_token: refresh },
    });
  }
  await dropSession();
}

export type DeleteResult =
  { ok: true; signedOut: boolean } | { ok: false; error: string };

/**
 * Delete the account on the server, then sign out here.
 *
 * The desktop's order and the desktop's reasons (main/api/account.ts). The
 * opposite of signOut(): leaving is a local decision the network may not veto,
 * but only the server can delete an account, so nothing changes here until it
 * has said yes. Dropping the session first would leave nobody signed in to
 * retry from, over an account that is still standing.
 *
 * `delete_account()` takes no argument -- it reads auth.uid() -- so there is no
 * way to name another account, and the rows go with the user through the
 * foreign key. No /auth/v1/logout after it: the user is gone and every session
 * on it with them.
 *
 * The tasks on this phone stay, the same as signing out. They were the
 * person's before there was an account to put them in.
 */
export async function deleteAccount(): Promise<DeleteResult> {
  const token = await accessToken();
  if (!token) {
    // Two different states come here. A renewal that failed on the network
    // keeps the session, so the person is still signed in and the true answer
    // is "offline"; only a refused renewal drops it, and that one has no
    // account left to delete from here.
    return { ok: false, error: currentSession() ? "offline" : "no_session" };
  }

  // Signing out and back in while this is in flight leaves a different
  // session behind. The delete happened either way, but dropping *that*
  // session would sign somebody out of an account nobody deleted.
  const marker = sessionEpoch();
  const res = await request("/rest/v1/rpc/delete_account", {
    method: "POST",
    token,
    body: {},
  });
  if (!res.ok) return { ok: false, error: errorCode(res) };

  const stillOurs = sessionEpoch() === marker;
  if (stillOurs) await dropSession();
  return { ok: true, signedOut: stillOurs };
}
