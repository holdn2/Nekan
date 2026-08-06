/**
 * What a session is, and when it has to be renewed -- as functions of their
 * inputs alone.
 *
 * The HTTP, the encryption and the single-flight refresh live in
 * main/api-client.js. What is left here is the part that goes wrong invisibly:
 * an expiry compared against the wrong clock, a reply that is missing half a
 * session, or a token that escapes to the renderer because a field was added
 * and a delete list was not updated.
 *
 * Required of main/ and the tests only -- never loaded by the renderer, which
 * is why this file may be plain CommonJS unlike core.js.
 */

/**
 * How early an access token counts as spent.
 *
 * Measured lifetime is 3599 seconds. Renewing at the last second is not enough:
 * a request that leaves valid can still arrive expired, and the reply would be
 * a 401 for no reason a user could act on. The last minute is treated as gone.
 */
const REFRESH_SKEW_MS = 60_000;

/** Empty strings are as useless as missing ones, and JWTs are always strings. */
function text(value) {
  return typeof value === "string" && value ? value : null;
}

/**
 * A token endpoint's reply -> the session we keep. Null if it is not one.
 *
 * `receivedAt` is when the reply landed, by our own clock. Supabase also sends
 * `expires_at` as an absolute second count, but that is the *server's* clock,
 * and every later comparison is against `Date.now()`. Deriving the deadline
 * from `expires_in` keeps both sides of those comparisons on one clock, so a
 * device whose clock is off renews on time instead of never or constantly.
 */
function sessionFromToken(body, receivedAt) {
  if (!body || typeof body !== "object") return null;
  const accessToken = text(body.access_token);
  const refreshToken = text(body.refresh_token);
  // Both or neither. An access token with no refresh token is an hour of app
  // that logs itself out, which is worse than never having logged in.
  if (!accessToken || !refreshToken) return null;

  const seconds = Number(body.expires_in);
  const lifetime = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
  const user = body.user && typeof body.user === "object" ? body.user : {};

  return {
    accessToken,
    refreshToken,
    expiresAt: receivedAt + lifetime,
    userId: text(user.id),
    email: text(user.email),
  };
}

/** A decrypted auth.json -> the session it stood for. Null if it is not one. */
function sessionFromStored(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const accessToken = text(parsed.accessToken);
  const refreshToken = text(parsed.refreshToken);
  if (!refreshToken) return null;

  const expiresAt = Number(parsed.expiresAt);
  return {
    // A file old enough to have lost its access token is still worth keeping:
    // the refresh token is what actually holds the login, and an expiry of 0
    // sends the next caller straight to a refresh.
    accessToken: accessToken || "",
    refreshToken,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
    userId: text(parsed.userId),
    email: text(parsed.email),
  };
}

/** Is this session too old to send? Missing and unparseable both count as yes. */
function needsRefresh(session, now, skew = REFRESH_SKEW_MS) {
  if (!session || !text(session.accessToken)) return true;
  // Written as a negated `>` so a NaN deadline answers yes rather than no.
  return !(session.expiresAt - skew > now);
}

/**
 * The only part of a session the renderer is ever given.
 *
 * Built by naming what may leave, not by deleting what may not: a field added
 * to the session later has to be listed here to escape, instead of escaping
 * because nobody remembered to exclude it.
 */
function publicSession(session) {
  if (!session) return null;
  return { email: session.email || null, userId: session.userId || null };
}

module.exports = {
  REFRESH_SKEW_MS,
  sessionFromToken,
  sessionFromStored,
  needsRefresh,
  publicSession,
};
