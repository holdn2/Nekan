/**
 * The ways in.
 *
 * Google is the only one a shipped app offers. The password pair below exists
 * for the same reason it does on the desktop: sync has to be verifiable
 * without a person clicking a consent screen, and it is only reachable outside
 * a release build. Removing it would leave no way to check syncing
 * automatically -- so if it ever goes, a replacement goes first.
 *
 * The shape is the desktop's with the browser swapped. There, consent happens
 * in the real browser and the code comes back to a loopback server; here it
 * happens in the system's auth session and the code comes back to a deep
 * link. Both are the same rule underneath: an app-owned webview is not
 * allowed to see a Google password, and Google blocks it.
 */
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import { publicSession, sessionFromToken } from "@nekan/shared/auth";
import { SUPABASE_URL } from "@nekan/shared/supabase";
import type { PublicSession } from "@nekan/shared/types";
import { errorCode, request } from "./http";
import { adoptSession, sessionEpoch } from "./session";

export type SignInResult =
  { ok: true; session: PublicSession | null } | { ok: false; error: string };

/**
 * Where Google sends the code back.
 *
 * `native` is not optional here, and leaving it out is a trap worth naming.
 * Without it `makeRedirectUri` falls through to `Linking.createURL`, which
 * builds `<scheme>://<hostUri><path>` -- and in a development build the
 * hostUri is the dev server's address, so the redirect comes out as
 * `nekan://192.168.x.x:8081/auth` with the machine's IP baked into it. Every
 * address change would then need another allowlist entry. Passing `native`
 * short-circuits that for anything that is not Expo Go, which is exactly the
 * set of builds that own the scheme.
 *
 * Expo Go still gets `exp://<ip>:8081/--/auth`, and there is no fixing that
 * from here: expo-linking's own documentation says the URL it produces there
 * is neither stable nor predictable and that authorization callbacks want a
 * build. Until there is one, the exact address has to be in the allowlist and
 * it changes with the network.
 *
 * The dev log prints whichever one this run will use -- the same courtesy the
 * desktop does for its loopback URL, and for the same reason: it cannot be
 * worked out from the source.
 */
function redirectUri(): string {
  const uri = makeRedirectUri({ native: "nekan://auth", path: "auth" });
  if (__DEV__) console.log("oauth redirect:", uri);
  return uri;
}

/**
 * A PKCE pair.
 *
 * The verifier is hex rather than base64url: the spec wants 43-128 characters
 * from an unreserved set, hex is inside that set, and it avoids hand-rolling a
 * base64url encoder on an engine whose `btoa` cannot be relied on. The
 * challenge has to be base64url, and that one the digest gives directly.
 */
async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const verifier = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  const challenge = digest
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return { verifier, challenge };
}

/**
 * The `code` Supabase appended to the redirect, or null if it did not.
 *
 * The fragment comes off first, and that is not tidiness. Supabase ends the
 * redirect with a bare `#` -- `nekan://auth?code=<uuid>#` -- and a parser that
 * only splits on `?` and `&` reads that hash as the last character of the
 * code. The exchange then fails with `flow_state_not_found`, which reads like
 * an expired or replayed login rather than a code with one character too many.
 */
function codeFrom(url: string): string | null {
  const hash = url.indexOf("#");
  const query = hash === -1 ? url : url.slice(0, hash);
  const at = query.indexOf("?");
  if (at === -1) return null;
  for (const pair of query.slice(at + 1).split("&")) {
    const [key, value] = pair.split("=");
    if (key === "code") return decodeURIComponent(value ?? "");
  }
  return null;
}

export async function signInWithGoogle(): Promise<SignInResult> {
  // A sign-out that lands while the browser is open ends this attempt too: the
  // person's last word was "sign out", and storing a session afterwards would
  // quietly undo it.
  const startedAt = sessionEpoch();

  const { verifier, challenge } = await pkcePair();
  const redirect = redirectUri();
  const authorize =
    `${SUPABASE_URL}/auth/v1/authorize?provider=google` +
    `&redirect_to=${encodeURIComponent(redirect)}` +
    `&code_challenge=${challenge}&code_challenge_method=s256`;

  // Both halves of the round trip, in the dev log. Neither can be worked out
  // from the source -- the redirect is built from the dev server's address --
  // and when this fails it fails inside a browser that cannot be inspected.
  if (__DEV__) console.log("oauth authorize:", authorize);

  const back = await WebBrowser.openAuthSessionAsync(authorize, redirect);
  if (__DEV__)
    console.log("oauth back:", back.type, "url" in back ? back.url : "");
  if (back.type !== "success") return { ok: false, error: "cancelled" };

  const code = codeFrom(back.url);
  if (!code) return { ok: false, error: "no_code" };

  const res = await request("/auth/v1/token?grant_type=pkce", {
    method: "POST",
    body: { auth_code: code, code_verifier: verifier },
  });
  if (!res.ok) return { ok: false, error: errorCode(res) };

  const next = sessionFromToken(res.body, Date.now());
  if (!next) return { ok: false, error: "bad_response" };
  if (sessionEpoch() !== startedAt) return { ok: false, error: "cancelled" };
  await adoptSession(next);
  return { ok: true, session: publicSession(next) };
}

/**
 * Password sign-in. Development only -- see the note at the top of this file.
 *
 * The screen decides whether to offer it, from `__DEV__`, the way the desktop
 * decides from `app.isPackaged`.
 */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<SignInResult> {
  const startedAt = sessionEpoch();
  const res = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  if (!res.ok) return { ok: false, error: errorCode(res) };

  const next = sessionFromToken(res.body, Date.now());
  if (!next) return { ok: false, error: "bad_response" };
  if (sessionEpoch() !== startedAt) return { ok: false, error: "cancelled" };
  await adoptSession(next);
  return { ok: true, session: publicSession(next) };
}
