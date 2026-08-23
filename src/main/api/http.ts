/**
 * One HTTP call to Supabase, and the two facts every call needs: where the
 * project is, and what the anon key is.
 *
 * Nothing here throws. A sync client spends its life offline and back again,
 * and a caller that has to wrap every call in try/catch ends up swallowing
 * real failures along with the tunnel it drove through. `{ ok: false, error }`
 * says which happened, and `status: 0` is reserved for "never reached the
 * server" so a dead network is not mistaken for a rejected credential.
 */

import { clockOffset, nextOffset } from "../../shared/sync";

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

/**
 * How far this machine's clock is behind the server's, in ms.
 *
 * Read off the Date header of every reply, so it costs no request of its own.
 * It matters because `updatedAt` is a client clock and it is what decides who
 * wins when the same task was edited twice: a laptop ten minutes slow would
 * lose every one of those, silently and forever.
 */
let skew = 0;

/**
 * One HTTP call. Never throws.
 *
 * `status: 0` is reserved for "did not reach the server" -- a dead network, a
 * DNS failure, the timeout above. Callers treat that differently from a 400,
 * because only one of the two means the credentials are wrong.
 */
/** What a caller may set on one request. `token` swaps the anon key out. */
interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
  prefer?: string;
}

/** What every call gets back. `body` is whatever JSON came, if any came. */
interface Reply {
  ok: boolean;
  status: number;
  body: any;
}

async function request(
  pathname: string,
  { method = "GET", body, token, prefer }: RequestOptions = {},
): Promise<Reply> {
  try {
    const headers: Record<string, string> = {
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
function errorCode(res: Reply) {
  if (res.status === 0) return "offline";
  const body = (res.body ?? {}) as { error_code?: string; error?: string };
  return body.error_code || body.error || `http_${res.status}`;
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

export { SUPABASE_URL, SUPABASE_ANON_KEY, request, errorCode, getClockOffset };
export type { Reply, RequestOptions };
