/**
 * The one session this process holds, and everything that renews or drops it.
 *
 * Refresh tokens rotate, which makes two rules non-negotiable and both of them
 * are in here: a new pair is written to disk before it is used, and there is
 * never more than one renewal in flight. See runRefresh() for the third, which
 * is that a renewal has to check the session it set out to renew is still the
 * one in hand.
 */

import type { Session } from "../../shared/types";
import {
  needsRefresh,
  publicSession,
  sessionFromToken,
} from "../../shared/auth";
import { clearSession, readSession, writeSession } from "../token-store";
import { request, errorCode } from "./http";

/** The live session, or null. The only copy in the process. */
let session: Session | null = null;
/** The refresh in flight, if any. See refreshSession(). */
let refreshing: Promise<Session | null> | null = null;

/**
 * Take a new session, on disk before anywhere else.
 *
 * The order matters because refresh tokens rotate: the moment the server
 * answers, the token that produced the answer is on its way out. Handing the
 * new pair to a caller before it is stored means a crash in between logs the
 * user out with no way back.
 */
function remember(next: Session | null) {
  session = next;
  writeSession(next);
  return next;
}

/**
 * How many times the session has been thrown away.
 *
 * A renewal in flight captures this and refuses to store its result if the
 * number moved while it was waiting. Without that, logging out during a
 * renewal is undone a second later: runRefresh() would call remember() with
 * the pair it just fetched, putting auth.json back and signing the user in
 * again after they asked to leave.
 */
let epoch = 0;

/** Drop the session from memory and disk. Used by logout and by a dead token. */
function forget() {
  session = null;
  epoch += 1;
  clearSession();
}

/**
 * Renew the access token, at most once at a time.
 *
 * The single flight is not an optimisation. Refresh tokens rotate, so two
 * renewals racing each other means the second one invalidates the first's
 * result and one of the two callers is holding a token that is already dead.
 * Everyone waits on the same promise instead.
 */
function refreshSession() {
  if (!refreshing) {
    refreshing = runRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

async function runRefresh() {
  const current = session;
  const startedAt = epoch;
  if (!current || !current.refreshToken) return null;

  const res = await request("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: { refresh_token: current.refreshToken },
  });

  // Is the session this renewal set out to renew still the one in hand?
  //
  // It may not be. Logging out and back in while this was in flight leaves a
  // *different* session in place, and the branches below would then act on it:
  // the 4xx path would delete a session that is perfectly good, and the
  // success path would overwrite it with tokens from the account that just
  // left. The epoch catches a logout, the identity check catches a sign-in
  // that replaced the session without one.
  const stillOurs = () => epoch === startedAt && session === current;

  if (!res.ok) {
    // A 4xx is the server saying this token will never work again -- rotated
    // past, revoked, account gone. Anything else is the network, and a session
    // must survive a tunnel: keep it and try again next time.
    if (res.status >= 400 && res.status < 500 && stillOurs()) forget();
    return null;
  }

  const next = sessionFromToken(res.body, Date.now());
  if (!next) {
    if (stillOurs()) forget();
    return null;
  }
  if (!stillOurs()) return null;
  // A refresh does not always carry the user object. Identity is not what was
  // being renewed, so keep what we already knew.
  return remember({
    ...next,
    userId: next.userId || current.userId,
    email: next.email || current.email,
  });
}

/**
 * A token good enough to send, renewing first if it is not. Null when not
 * logged in or when the renewal failed.
 *
 * Nothing calls this yet -- main/sync.js will, in the next piece. It is here
 * because the rotation handling it guards is the whole reason this file exists
 * before any screen does.
 */
async function getAccessToken() {
  if (!session) return null;
  if (!needsRefresh(session, Date.now())) return session.accessToken;
  const next = await refreshSession();
  return next ? next.accessToken : null;
}

/* --------------------------------------------------------------- public */

/**
 * Restore the session left by the last run.
 *
 * Called from main.js at startup. The renewal is deliberately not awaited: a
 * laptop that was shut for a day comes back with a dead access token, but
 * nothing needs one before the window is up, and a slow network must not hold
 * the app on a blank screen.
 */
function initAuth() {
  session = readSession();
  if (session && needsRefresh(session, Date.now())) refreshSession();
  return publicSession(session);
}

/** Who is logged in, as much of it as the renderer may know. */
function getPublicSession() {
  return publicSession(session);
}

/**
 * The three reads the sign-in and account paths need.
 *
 * They exist because those paths have to notice a logout that landed while
 * they were waiting on the network -- see the comment on `epoch` above. Kept
 * as functions rather than exported bindings so nobody outside this file can
 * capture the session and hold it past the moment it was true, and left out of
 * the api-client barrel so nobody outside api/ can reach them at all.
 */
const currentSession = () => session;
const refreshInFlight = () => refreshing;
const logoutEpoch = () => epoch;

export {
  remember,
  forget,
  refreshSession,
  getAccessToken,
  initAuth,
  getPublicSession,
  currentSession,
  refreshInFlight,
  logoutEpoch,
};
