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
const { loopbackCode, pkcePair } = require("./oauth");

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
 * Add this to Date.now() to get the server's idea of now.
 *
 * Zero until the first reply lands, and zero forever for anyone who never logs
 * in -- an offline app has no second clock to disagree with.
 */
function getClockOffset() {
  return skew;
}

/**
 * Sign in with Google: consent in the real browser, tokens back here.
 *
 * This is the only way in that the shipped app offers. The password pair below
 * still exists because sync has to be testable without a person clicking a
 * consent screen, but ipc.js only registers it outside a packaged build.
 */
async function loginWithGoogle() {
  if (!canStore()) return { ok: false, error: "no_secure_storage" };

  // A logout that lands while the browser is still open ends this attempt too:
  // the user's last word on being signed in was "log out", and storing a
  // session afterwards would quietly undo it.
  const startedAt = epoch;

  const { verifier, challenge } = pkcePair();
  const back = await loopbackCode(
    (redirect) =>
      `${SUPABASE_URL}/auth/v1/authorize?provider=google` +
      `&redirect_to=${encodeURIComponent(redirect)}` +
      `&code_challenge=${challenge}&code_challenge_method=s256`,
  );
  if (!back.ok) return { ok: false, error: back.error };

  const res = await request("/auth/v1/token?grant_type=pkce", {
    method: "POST",
    body: { auth_code: back.code, code_verifier: verifier },
  });
  if (!res.ok) return { ok: false, error: errorCode(res) };

  const next = sessionFromToken(res.body, Date.now());
  if (!next) return { ok: false, error: "bad_response" };
  if (epoch !== startedAt) return { ok: false, error: "cancelled" };
  remember(next);
  return { ok: true, session: publicSession(next) };
}

async function login(email, password) {
  // Checked before the request, not after: a successful login we cannot store
  // is a login that vanishes on restart, and the user would have no idea why.
  if (!canStore()) return { ok: false, error: "no_secure_storage" };
  const startedAt = epoch;

  const res = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  if (!res.ok) return { ok: false, error: errorCode(res) };

  const next = sessionFromToken(res.body, Date.now());
  if (!next) return { ok: false, error: "bad_response" };
  if (epoch !== startedAt) return { ok: false, error: "cancelled" };
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
 * Ask the server to end a session we have already thrown away locally.
 *
 * Renews first when the access token is spent, because /auth/v1/logout answers
 * a stale one with a 401 and does nothing -- which would leave the refresh
 * token alive on the server after a logout, and anyone holding a copy of
 * auth.json still inside the account. The renewal is deliberately a plain
 * request rather than refreshSession(): that path stores what it gets, and
 * this session is on its way out.
 */
async function revoke(previous, inFlight) {
  // A renewal that was already running holds this same refresh token, and
  // rotation means a second exchange would invalidate one of the two -- the
  // race refreshSession()'s single flight exists to prevent. Rather than
  // start one, stand down: the token it fetched is already orphaned by the
  // logout and expires on its own, which is the same outcome as revoking
  // while offline.
  if (inFlight) {
    await inFlight.catch(() => {});
    return;
  }

  let token = previous.accessToken;
  if (needsRefresh(previous, Date.now())) {
    const res = await request("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: { refresh_token: previous.refreshToken },
    });
    const renewed = res.ok ? sessionFromToken(res.body, Date.now()) : null;
    token = renewed ? renewed.accessToken : null;
  }

  // `scope=local` ends this session and no other. The default is `global`,
  // which revokes every refresh token the account has -- so logging out on the
  // laptop would sign the phone out too. On an app whose whole point is being
  // signed in on more than one machine, that is the wrong default.
  if (token) {
    await request("/auth/v1/logout?scope=local", { method: "POST", token });
  }
}

/**
 * Log out here first, then ask the server to revoke.
 *
 * That order is the point: logging out is something a user has decided, and it
 * cannot be allowed to fail because the network did. The revoke is not awaited
 * for the same reason -- offline it would sit on the request timeout while the
 * user watches a button that has already done its job. If it never lands, the
 * refresh token expires on its own.
 */
async function logout() {
  const previous = session;
  // Captured before forget(), which does not stop a renewal already running.
  const inFlight = refreshing;
  forget();
  if (previous) revoke(previous, inFlight).catch(() => {});
  return { ok: true };
}

/**
 * Delete the account on the server, then sign out here.
 *
 * The opposite order from logout(), and for the opposite reason. Logging out is
 * a local decision the network is not allowed to veto; deleting an account is
 * something only the server can do, so there is nothing to report until it has
 * said yes. Signing out first would leave the user with no session to retry
 * from and an account still standing.
 *
 * `delete_account()` takes no argument -- it reads auth.uid() -- so there is no
 * way to name somebody else's account, and the rows go with it through the
 * foreign key. No /auth/v1/logout afterwards: the user row is gone and every
 * session on it with it, so there is nothing left to revoke.
 */
async function deleteAccount() {
  const token = await getAccessToken();
  // Includes a refresh that failed with a 4xx, which has already thrown the
  // session away. Either way there is no account here to delete.
  if (!token) return { ok: false, error: "no_session" };

  const res = await request("/rest/v1/rpc/delete_account", {
    method: "POST",
    token,
    body: {},
  });
  if (!res.ok) return { ok: false, error: errorCode(res) };

  forget();
  return { ok: true };
}

module.exports = {
  SUPABASE_URL,
  request,
  initAuth,
  getPublicSession,
  getAccessToken,
  getClockOffset,
  loginWithGoogle,
  login,
  signup,
  logout,
  deleteAccount,
};
