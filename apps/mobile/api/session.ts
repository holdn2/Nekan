/**
 * The one session this app holds, and everything that renews or drops it.
 *
 * The same three rules as the desktop's `main/api/session.ts`, and they are
 * not negotiable on either platform because they are about the server's
 * behaviour rather than the client's: refresh tokens rotate.
 *
 *   1. A new pair is written to storage before it is used. The moment the
 *      server answers, the token that produced the answer is on its way out --
 *      handing the new pair to a caller before storing it means a crash in
 *      between signs the person out with no way back.
 *
 *   2. Never more than one renewal in flight. Two racing each other means the
 *      second invalidates the first's result and one caller is left holding a
 *      token that is already dead. Everyone waits on the same promise.
 *
 *   3. A renewal checks that the session it set out to renew is still the one
 *      in hand. Signing out and back in while one is in flight leaves a
 *      *different* session in place, and the branches below would act on it:
 *      the 4xx path would delete a good session, the success path would
 *      overwrite it with tokens from the account that just left.
 *
 * Writing is async here where the desktop's is not -- SecureStore returns a
 * promise -- so rule 1 is `await`ed rather than assumed.
 */
import {
  needsRefresh,
  publicSession,
  sessionFromToken,
} from "@nekan/shared/auth";
import type { PublicSession, Session } from "@nekan/shared/types";
import { clearSession, readSession, writeSession } from "./tokens";
import { request } from "./http";

/** The live session, or null. The only copy in the app. */
let session: Session | null = null;
/** The renewal in flight, if any. See `refreshSession`. */
let refreshing: Promise<Session | null> | null = null;

/**
 * How many times the session has been thrown away.
 *
 * A renewal in flight captures this and refuses to store its result if the
 * number moved while it was waiting. Without it, signing out during a renewal
 * is undone a second later.
 */
let epoch = 0;

/** Rule 1: storage first, then anywhere else. */
async function remember(next: Session | null): Promise<Session | null> {
  session = next;
  await writeSession(next);
  return next;
}

/** Drop the session from memory and storage. Logout, and a dead token. */
async function forget(): Promise<void> {
  session = null;
  epoch += 1;
  await clearSession();
}

/** Rule 2. */
function refreshSession(): Promise<Session | null> {
  if (!refreshing) {
    refreshing = runRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

async function runRefresh(): Promise<Session | null> {
  const current = session;
  const startedAt = epoch;
  if (!current?.refreshToken) return null;

  const res = await request("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: { refresh_token: current.refreshToken },
  });

  /** Rule 3. The epoch catches a logout; the identity check catches a sign-in
      that replaced the session without one. */
  const stillOurs = () => epoch === startedAt && session === current;

  if (!res.ok) {
    // A 4xx is the server saying this token will never work again -- rotated
    // past, revoked, account gone. Anything else is the network, and a session
    // has to survive a tunnel: keep it and try again next time.
    if (res.status >= 400 && res.status < 500 && stillOurs()) await forget();
    return null;
  }

  const next = sessionFromToken(res.body, Date.now());
  if (!next) {
    if (stillOurs()) await forget();
    return null;
  }
  if (!stillOurs()) return null;
  // A refresh does not always carry the user object. Identity is not what was
  // being renewed, so keep what was already known.
  return remember({
    ...next,
    userId: next.userId || current.userId,
    email: next.email || current.email,
  });
}

/**
 * A token good enough to send, renewing first if it is not.
 *
 * Null when nobody is signed in, and null when the renewal failed -- the
 * caller treats those the same, because in both cases there is nothing to
 * send.
 */
export async function accessToken(): Promise<string | null> {
  if (!session) return null;
  if (!needsRefresh(session, Date.now())) return session.accessToken;
  const next = await refreshSession();
  return next ? next.accessToken : null;
}

/**
 * Restore the session left by the last run.
 *
 * The renewal is deliberately not awaited: a phone that was closed for a day
 * comes back with a dead access token, but nothing needs one before the board
 * is on screen, and a slow network must not hold the app on a blank one.
 */
export async function initAuth(): Promise<PublicSession | null> {
  session = await readSession();
  if (session && needsRefresh(session, Date.now())) void refreshSession();
  return publicSession(session);
}

/** Who is signed in, as much of it as a screen may know. */
export const currentSession = (): PublicSession | null =>
  publicSession(session);

/**
 * Take a session that arrived from signing in.
 *
 * Here rather than exported as a setter on `session` so nobody outside this
 * file can hold the object past the moment it was true -- the same reason the
 * desktop keeps these as functions.
 */
export async function adoptSession(next: Session): Promise<void> {
  epoch += 1;
  await remember(next);
}

/** What logout needs, without letting the token itself out of this file. */
export function sessionEpoch(): number {
  return epoch;
}

export async function dropSession(): Promise<void> {
  await forget();
}

/** The refresh token, for the one call that has to revoke it. */
export function refreshTokenFor(marker: number): string | null {
  return marker === epoch ? (session?.refreshToken ?? null) : null;
}
