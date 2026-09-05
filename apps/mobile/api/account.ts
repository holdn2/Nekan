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
  dropSession,
  refreshTokenFor,
  sessionEpoch,
} from "./session";
import { request } from "./http";

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
