/**
 * Letting go of Apple when the account goes.
 *
 * Apple's account-deletion guidance says an app offering Sign in with Apple
 * should revoke the person's tokens when they delete their account. Supabase
 * does not do it, and it cannot be done from here: revoking needs a client
 * secret signed with the .p8 key, which has no business in a phone. So the
 * work is split -- the phone gets a fresh authorization code from the system
 * sheet, and `supabase/functions/apple-revoke` spends it.
 *
 * The sheet is the cost of not storing anything. Apple hands out an
 * authorization code every time someone signs in, but it is single-use and
 * lives five minutes, so the one from the original sign-in is long gone. The
 * alternative was keeping Apple credentials on our server for every account
 * against the day it might be deleted, which is a worse trade than one Face ID.
 *
 * Nothing here touches the session. The identity token the sheet also returns
 * is dropped on the floor -- this is not a sign-in, and the account being
 * deleted is the one already signed in.
 *
 * The access token is fetched twice rather than passed in, and that is the
 * point: a person can stand in front of that sheet for as long as they like,
 * and `accessToken()` only renews inside the last minute of an hour. A token
 * taken before the sheet can be dead by the time the sheet is answered.
 */
import * as AppleAuthentication from "expo-apple-authentication";
import { errorCode, request } from "./http";
import { accessToken } from "./session";

/**
 * What happened, in the only terms the screen needs.
 *
 * `skipped` is "there was nothing to revoke": not an Apple account, or a
 * device with no Sign in with Apple at all.
 *
 * `unknown` is "we could not find out", and it is kept apart from `skipped` on
 * purpose. The deletion still goes ahead -- nothing here may stop it -- but a
 * `/auth/v1/user` that fails on its own while the delete succeeds is an
 * ordinary thing (GoTrue and PostgREST are separate services), and folding it
 * into `skipped` would mean an Apple link left standing with nobody told. This
 * repo shows what it may have lost; the screen says so conditionally, because
 * from here a Google account and an Apple one look the same.
 */
export type RevokeOutcome =
  "done" | "skipped" | "unknown" | "cancelled" | "failed";

/** Does this account sign in with Apple? Null when the question failed. */
async function usesApple(token: string): Promise<boolean | null> {
  const res = await request("/auth/v1/user", { token });
  if (!res.ok) return null;
  const user = (res.body ?? {}) as {
    identities?: unknown;
    app_metadata?: { providers?: unknown; provider?: unknown };
  };
  // Identities is the full list; app_metadata is what is left when a project
  // does not return identities. Either naming Apple is enough.
  if (Array.isArray(user.identities))
    return user.identities.some(
      (one) => (one as { provider?: unknown })?.provider === "apple",
    );
  const providers = user.app_metadata?.providers;
  if (Array.isArray(providers)) return providers.includes("apple");
  return user.app_metadata?.provider === "apple";
}

/**
 * Revoke, if there is anything to revoke.
 *
 * `cancelled` is the one outcome the caller must not walk past. Closing the
 * sheet is a person saying no to something, and the next thing that happens
 * cannot be undone. Every other failure lets the deletion through: a revoke we
 * are unable to perform must not become an account nobody can leave, which is
 * the very rule this whole path exists to satisfy.
 */
export async function revokeApple(): Promise<RevokeOutcome> {
  const token = await accessToken();
  if (!token) return "skipped";

  // Android, and iOS before 13. The sheet would reject with an availability
  // error, which is not a cancel, so without this the person would be told to
  // go and clear an Apple link in a Settings app they do not have.
  if (!(await AppleAuthentication.isAvailableAsync().catch(() => false)))
    return "skipped";

  const apple = await usesApple(token);
  if (apple === null) return "unknown";
  if (!apple) return "skipped";

  let code: string | null;
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
    code = credential.authorizationCode;
  } catch (err) {
    const failure = (err as { code?: unknown } | null)?.code;
    return failure === "ERR_REQUEST_CANCELED" ? "cancelled" : "failed";
  }
  if (!code) return "failed";

  // Asked again, after the sheet. See the note at the top of the file.
  const fresh = await accessToken();
  if (!fresh) return "failed";

  const res = await request("/functions/v1/apple-revoke", {
    method: "POST",
    token: fresh,
    body: { code },
  });
  if (!res.ok) {
    // The reason goes nowhere else. "not_configured" and "invalid_grant" are
    // both "it did not happen" to the person holding the phone, and the app
    // does nothing differently for either -- this line is for whoever is
    // reading a dev run, and for them only.
    if (__DEV__) console.log("apple revoke failed:", errorCode(res));
    return "failed";
  }
  return "done";
}
