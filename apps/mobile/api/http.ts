/**
 * One HTTP call to Supabase, and the clock offset that rides along with it.
 *
 * The desktop has a file of this name doing the same job. They are not shared
 * because `src/shared/` is compiled without DOM types on purpose -- `fetch`
 * and `AbortController` do not exist there, and loosening that would let a
 * Node or browser API into the one place both apps read. What *is* shared is
 * the part with no platform in it: the project constants and the clock maths.
 *
 * Nothing here throws. A sync client spends its life offline and back again,
 * and a caller that wraps every call in try/catch ends up swallowing real
 * failures along with the tunnel it drove through. `status: 0` is reserved for
 * "never reached the server", so a dead network is not mistaken for a rejected
 * credential -- the two need opposite responses, one retries and one signs out.
 */
import { clockOffset, nextOffset } from "@nekan/shared/sync";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@nekan/shared/supabase";

/** A request that never comes back leaves a screen waiting on a promise. */
const TIMEOUT_MS = 15_000;

/**
 * How far this device's clock is behind the server's, in ms.
 *
 * Read off the `Date` header of every reply, so it costs no request of its
 * own. It matters because `updatedAt` is a client clock and it decides who
 * wins when the same task was edited on two devices: a phone ten minutes slow
 * would lose every one of those edits, silently and forever.
 */
let skew = 0;

export interface Reply {
  ok: boolean;
  status: number;
  body: unknown;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Swaps the anon key out for a user's access token. */
  token?: string | null;
  prefer?: string;
}

/**
 * Hermes has no `AbortSignal.timeout`, so the timer is wired by hand.
 *
 * Written out rather than polyfilled: one caller, four lines, and a polyfill
 * would be a second thing to remember when the engine grows the method.
 */
function withTimeout(): { signal: AbortSignal; done: () => void } {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  return { signal: control.signal, done: () => clearTimeout(timer) };
}

/** One HTTP call. Never throws. */
export async function request(
  pathname: string,
  { method = "GET", body, token, prefer }: RequestOptions = {},
): Promise<Reply> {
  const { signal, done } = withTimeout();
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
      signal,
    });
    // Every reply carries a Date, the failures included. Reading it here means
    // the offset is known from the first request the app ever makes, rather
    // than after a sync has already stamped something with a wrong clock.
    skew = nextOffset(skew, clockOffset(res.headers.get("date"), Date.now()));
    const raw = await res.text();
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    return { ok: res.ok, status: res.status, body: parsed };
  } catch {
    return { ok: false, status: 0, body: null };
  } finally {
    done();
  }
}

/**
 * A failed reply, as a code a screen can turn into a sentence.
 *
 * Supabase's own wording is English and changes; the codes do not. Anything
 * unrecognised falls through as itself, so a new one is visible rather than
 * swallowed into a generic message.
 */
export function errorCode(res: Reply): string {
  if (res.status === 0) return "offline";
  const body = (res.body ?? {}) as { error_code?: string; error?: string };
  return body.error_code || body.error || `http_${res.status}`;
}

/**
 * Add this to `Date.now()` for the server's idea of now.
 *
 * Zero until the first reply lands, and zero forever for anyone who never
 * signs in -- an offline app has no second clock to disagree with.
 */
export const serverOffset = (): number => skew;
