/**
 * The one place this app talks to Supabase.
 *
 * Everything here returns a result instead of throwing. A sync client spends
 * its life offline and back again, and a caller that has to wrap every call in
 * try/catch ends up swallowing real failures along with the tunnel it drove
 * through. `{ ok: false, error }` says which happened.
 *
 * The renderer never sees a token. It asks for auth:login and gets back an
 * email address; window.api has no function that returns a token, so a
 * compromised renderer has nothing to take. safeStorage being main-only forces
 * this shape anyway -- it is just as well that it is also the right one.
 */

const {
  needsRefresh,
  publicSession,
  sessionFromToken,
} = require("../shared/auth");
const { clockOffset, nextOffset } = require("../shared/sync");
const {
  canStore,
  clearSession,
  readSession,
  writeSession,
} = require("./token-store");

/**
 * The project. Both values are public by design: the anon key is a JWT whose
 * payload says `"role": "anon"`, and every client that speaks to the project
 * has to carry it -- shipping it in the app is the intended arrangement, not a
 * leak. The boundary is row level security, which 0001_tasks.sql puts on the
 * table and supabase/verify.js checks against the live project.
 *
 * `service_role` must never appear here or anywhere else in the app. It
 * bypasses RLS completely.
 *
 * The env overrides are for pointing a dev run at a second project so it does
 * not share rows with the one verify.js writes to.
 */
const SUPABASE_URL =
  process.env.NEKAN_SUPABASE_URL || "https://bycfderwvgceffqorkup.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEKAN_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5Y2ZkZXJ3dmdjZWZmcW9ya3VwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4OTE4NTIsImV4cCI6MjEwMTQ2Nzg1Mn0.qh8jKRtKdJ9-_GSSHwtD35_VWS-YOR0sb9edyoORFt8";

/**
 * A request that never comes back is worse than one that fails: the caller is
 * an IPC handler, and the renderer would sit on a promise forever.
 */
const TIMEOUT_MS = 15_000;

/** The live session, or null. The only copy in the process. */
let session = null;
/** The refresh in flight, if any. See refreshSession(). */
let refreshing = null;
/**
 * How far this machine's clock is behind the server's, in ms.
 *
 * Read off the Date header of every reply, so it costs no request of its own.
 * It matters because `updatedAt` is a client clock and it is what decides who
 * wins when the same task was edited twice: a laptop ten minutes slow would
 * lose every one of those, silently and forever.
 */
let skew = 0;

/* ----------------------------------------------------------------- http */

/**
 * One HTTP call. Never throws.
 *
 * `status: 0` is reserved for "did not reach the server" -- a dead network, a
 * DNS failure, the timeout above. Callers treat that differently from a 400,
 * because only one of the two means the credentials are wrong.
 */
async function request(pathname, { method = "GET", body, token, prefer } = {}) {
  try {
    const headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    };
    if (prefer) headers.Prefer = prefer;

    const res = await fetch(`${SUPABASE_URL}${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Every reply carries a Date, including the failures. Reading it here means
    // the offset is known from the first request the app ever makes, rather
    // than after a sync has already stamped something with a wrong clock.
    skew = nextOffset(skew, clockOffset(res.headers.get("date"), Date.now()));
    const raw = await res.text();
    let parsed = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    return { ok: res.ok, status: res.status, body: parsed };
  } catch {
    return { ok: false, status: 0, body: null };
  }
}

/**
 * A failed reply -> a code the UI can map to a sentence.
 *
 * Supabase's own wording is English and changes; the codes do not. Phase 3
 * turns these into Korean, and anything unrecognised falls through as itself
 * so a new one is visible rather than swallowed.
 */
function errorCode(res) {
  if (res.status === 0) return "offline";
  const body = res.body || {};
  return body.error_code || body.error || `http_${res.status}`;
}

/* -------------------------------------------------------------- session */

/**
 * Take a new session, on disk before anywhere else.
 *
 * The order matters because refresh tokens rotate: the moment the server
 * answers, the token that produced the answer is on its way out. Handing the
 * new pair to a caller before it is stored means a crash in between logs the
 * user out with no way back.
 */
function remember(next) {
  session = next;
  writeSession(next);
  return next;
}

/** Drop the session from memory and disk. Used by logout and by a dead token. */
function forget() {
  session = null;
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
  if (!current || !current.refreshToken) return null;

  const res = await request("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: { refresh_token: current.refreshToken },
  });

  if (!res.ok) {
    // A 4xx is the server saying this token will never work again -- rotated
    // past, revoked, account gone. Anything else is the network, and a session
    // must survive a tunnel: keep it and try again next time.
    if (res.status >= 400 && res.status < 500) forget();
    return null;
  }

  const next = sessionFromToken(res.body, Date.now());
  if (!next) {
    forget();
    return null;
  }
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
 * Add this to Date.now() to get the server's idea of now.
 *
 * Zero until the first reply lands, and zero forever for anyone who never logs
 * in -- an offline app has no second clock to disagree with.
 */
function getClockOffset() {
  return skew;
}

async function login(email, password) {
  // Checked before the request, not after: a successful login we cannot store
  // is a login that vanishes on restart, and the user would have no idea why.
  if (!canStore()) return { ok: false, error: "no_secure_storage" };

  const res = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  if (!res.ok) return { ok: false, error: errorCode(res) };

  const next = sessionFromToken(res.body, Date.now());
  if (!next) return { ok: false, error: "bad_response" };
  remember(next);
  return { ok: true, session: publicSession(next) };
}

/**
 * Sign up, and log in with it when the project allows.
 *
 * Whether a session comes back depends on a project setting: with email
 * confirmation off it does, with it on the account exists but is unusable
 * until a link is clicked. Both are reported rather than one being assumed --
 * that setting is going to be turned on before launch.
 */
async function signup(email, password) {
  if (!canStore()) return { ok: false, error: "no_secure_storage" };

  const res = await request("/auth/v1/signup", {
    method: "POST",
    body: { email, password },
  });
  if (!res.ok) return { ok: false, error: errorCode(res) };

  const next = sessionFromToken(res.body, Date.now());
  if (!next) return { ok: true, session: null, confirmationRequired: true };
  remember(next);
  return {
    ok: true,
    session: publicSession(next),
    confirmationRequired: false,
  };
}

/**
 * Log out here first, then ask the server to revoke.
 *
 * That order is the point: logging out is something a user has decided, and it
 * cannot be allowed to fail because the network did. The revoke is best effort
 * -- if it does not land, the refresh token simply expires on its own.
 */
async function logout() {
  const token = session ? session.accessToken : null;
  forget();
  if (token) await request("/auth/v1/logout", { method: "POST", token });
  return { ok: true };
}

module.exports = {
  SUPABASE_URL,
  request,
  initAuth,
  getPublicSession,
  getAccessToken,
  getClockOffset,
  login,
  signup,
  logout,
};
