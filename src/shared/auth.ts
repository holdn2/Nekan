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
 * is why this file is a plain module unlike core.js.
 */

import type { PublicSession, Session } from "./types.js";

/**
 * How early an access token counts as spent.
 *
 * Measured lifetime is 3599 seconds. Renewing at the last second is not enough:
 * a request that leaves valid can still arrive expired, and the reply would be
 * a 401 for no reason a user could act on. The last minute is treated as gone.
 */
export const REFRESH_SKEW_MS = 60_000;

/** Empty strings are as useless as missing ones, and JWTs are always strings. */
function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/** Anything parsed from a reply or a file: known to be an object, no more. */
type Unknowns = Record<string, unknown>;

/** Is this an object we can read fields off, rather than null or a scalar? */
const fields = (value: unknown): Unknowns | null =>
  value && typeof value === "object" ? (value as Unknowns) : null;

/**
 * A token endpoint's reply -> the session we keep. Null if it is not one.
 *
 * `receivedAt` is when the reply landed, by our own clock. Supabase also sends
 * `expires_at` as an absolute second count, but that is the *server's* clock,
 * and every later comparison is against `Date.now()`. Deriving the deadline
 * from `expires_in` keeps both sides of those comparisons on one clock, so a
 * device whose clock is off renews on time instead of never or constantly.
 */
export function sessionFromToken(
  body: unknown,
  receivedAt: number,
): Session | null {
  const reply = fields(body);
  if (!reply) return null;
  const accessToken = text(reply.access_token);
  const refreshToken = text(reply.refresh_token);
  // Both or neither. An access token with no refresh token is an hour of app
  // that logs itself out, which is worse than never having logged in.
  if (!accessToken || !refreshToken) return null;

  const seconds = Number(reply.expires_in);
  const lifetime = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
  const user = fields(reply.user) ?? {};

  return {
    accessToken,
    refreshToken,
    expiresAt: receivedAt + lifetime,
    // A reply with no user is still a session -- the tokens are what the app
    // runs on -- so this stays null rather than being refused or blanked.
    userId: text(user.id),
    email: text(user.email),
  };
}

/** A decrypted auth.json -> the session it stood for. Null if it is not one. */
export function sessionFromStored(parsed: unknown): Session | null {
  const stored = fields(parsed);
  if (!stored) return null;
  const accessToken = text(stored.accessToken);
  const refreshToken = text(stored.refreshToken);
  if (!refreshToken) return null;

  const expiresAt = Number(stored.expiresAt);
  return {
    // A file old enough to have lost its access token is still worth keeping:
    // the refresh token is what actually holds the login, and an expiry of 0
    // sends the next caller straight to a refresh.
    accessToken: accessToken || "",
    refreshToken,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
    userId: text(stored.userId),
    email: text(stored.email),
  };
}

/** Is this session too old to send? Missing and unparseable both count as yes. */
export function needsRefresh(
  // Partial on purpose: the case this decides is "there is not enough of a
  // session left to send", and a file that lost its access token is exactly
  // that. test/auth.test.ts passes one.
  session: Partial<Session> | null | undefined,
  now: number,
  skew: number = REFRESH_SKEW_MS,
): boolean {
  if (!session || !text(session.accessToken)) return true;
  // Written as a negated `>` so a NaN deadline -- or a missing one -- answers
  // yes rather than no.
  return !((session.expiresAt as number) - skew > now);
}

/**
 * The only part of a session the renderer is ever given.
 *
 * Built by naming what may leave, not by deleting what may not: a field added
 * to the session later has to be listed here to escape, instead of escaping
 * because nobody remembered to exclude it.
 */
export function publicSession(
  // Wider than Session, and that is the point being made: a field added to the
  // session later must not escape because nobody remembered to exclude it, so
  // this has to accept an object carrying fields it has never heard of.
  session: Partial<Session> | null | undefined,
): PublicSession | null {
  if (!session) return null;
  return { email: session.email || null, userId: session.userId || null };
}
