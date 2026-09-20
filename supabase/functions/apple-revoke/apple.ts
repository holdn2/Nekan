/**
 * Talking to Apple about one person's tokens.
 *
 * Separate from index.ts, which is the Deno entry point, because everything
 * here is a pure function of its arguments plus `fetch` -- and the part that
 * goes wrong invisibly is the signature. A client secret with a
 * wrongly-encoded signature is refused by Apple as `invalid_client`, which
 * reads like a misconfigured key rather than a bad encoder, so test/ signs one
 * and verifies it against the public half.
 *
 * Nothing in this file is Supabase's. It speaks to appleid.apple.com only.
 */

/** Everything needed to prove to Apple that we are this app. */
export interface AppleKey {
  /** The .p8 file's contents, PEM header and all. */
  privateKey: string;
  /** The 10-character identifier of that key. */
  keyId: string;
  /** The 10-character team identifier. */
  teamId: string;
  /**
   * The bundle id for a native sign-in, a Services ID for the web one. It has
   * to be the same value the sign-in used, or the code will not exchange.
   */
  clientId: string;
}

const APPLE = "https://appleid.apple.com";

/** How long a client secret is good for. Apple's ceiling is six months. */
const SECRET_LIFETIME_S = 300;

/**
 * How long any one outside call may take.
 *
 * Set by the phone, not by taste. The phone gives up on this function after
 * 15 seconds (`apps/mobile/api/http.ts`), and one request here can make three
 * calls in a row -- the caller check, the exchange, the revoke. Four seconds
 * each keeps the worst case at twelve, so the function always answers before
 * the phone stops listening. Without a limit a hung Apple would hold the
 * function until the platform killed it, and the phone would report a
 * failure for a revoke that might still go through afterwards.
 */
export const CALL_TIMEOUT_MS = 4_000;

/** base64url of bytes or of a string's UTF-8, unpadded -- what JOSE wants. */
function base64url(input: string | Uint8Array): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** The DER inside a PEM, as bytes. */
function derOf(pem: string): Uint8Array {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * The client secret Apple asks for: a short-lived ES256 JWT we sign ourselves.
 *
 * Generated per call rather than stored. The alternative is a pre-made JWT in
 * a secret, which expires -- and an expired secret does not fail loudly, it
 * makes revocation stop working while everything else keeps going.
 *
 * The signature needs no DER-to-JOSE conversion, and that is worth saying out
 * loud because most examples do one. WebCrypto's ECDSA already returns the raw
 * r || s pair that JOSE specifies; OpenSSL and Node's `crypto.sign` return DER
 * instead, which is where that conversion step comes from.
 */
export async function clientSecret(
  key: AppleKey,
  now: number = Date.now(),
): Promise<string> {
  const issued = Math.floor(now / 1000);
  const header = { alg: "ES256", kid: key.keyId, typ: "JWT" };
  const claims = {
    iss: key.teamId,
    iat: issued,
    exp: issued + SECRET_LIFETIME_S,
    aud: APPLE,
    sub: key.clientId,
  };
  const signing = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(claims),
  )}`;

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    derOf(key.privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(signing),
  );
  return `${signing}.${base64url(new Uint8Array(signature))}`;
}

/** Apple's endpoints take forms, not JSON. */
async function post(path: string, form: Record<string, string>) {
  const res = await fetch(`${APPLE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  // A revoke answers 200 with an empty body, so this has to survive one.
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

/** Apple's own error name, or something that says where it came from. */
function reason(result: { status: number; body: unknown }): string {
  const named = (result.body as { error?: unknown } | null)?.error;
  return typeof named === "string" && named ? named : `apple_${result.status}`;
}

export type Revoked =
  | { ok: true }
  /**
   * `stage` says which of Apple's two endpoints refused. Without it the same
   * word means two different faults -- `invalid_grant` from the exchange is a
   * spent or expired code, and from the revoke it is a token Apple no longer
   * holds -- and nothing else in the answer tells them apart.
   */
  | { ok: false; error: string; stage: "exchange" | "revoke" };

/**
 * Turn an authorization code into tokens and revoke them, in one go.
 *
 * The code is the only thing the app can hand us: it is single-use and lives
 * five minutes, so there is nothing here worth storing even for a moment. The
 * tokens it becomes are revoked in the same request and never leave this
 * function.
 *
 * The refresh token is what gets revoked when there is one. Apple's revoke
 * accepts either, but revoking the refresh token takes the access token with
 * it and not the other way round.
 */
export async function revokeWithCode(
  key: AppleKey,
  code: string,
): Promise<Revoked> {
  const secret = await clientSecret(key);

  const exchanged = await post("/auth/token", {
    client_id: key.clientId,
    client_secret: secret,
    code,
    grant_type: "authorization_code",
  });
  if (!exchanged.ok)
    return { ok: false, error: reason(exchanged), stage: "exchange" };

  const tokens = (exchanged.body ?? {}) as {
    refresh_token?: unknown;
    access_token?: unknown;
  };
  const refresh =
    typeof tokens.refresh_token === "string" ? tokens.refresh_token : null;
  const access =
    typeof tokens.access_token === "string" ? tokens.access_token : null;
  const token = refresh ?? access;
  if (!token) return { ok: false, error: "no_token", stage: "exchange" };

  const revoked = await post("/auth/revoke", {
    client_id: key.clientId,
    client_secret: secret,
    token,
    token_type_hint: refresh ? "refresh_token" : "access_token",
  });
  if (!revoked.ok)
    return { ok: false, error: reason(revoked), stage: "revoke" };
  return { ok: true };
}
