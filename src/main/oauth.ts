/**
 * The browser half of signing in with Google.
 *
 * Google refuses OAuth inside an app's own webview, so the consent screen has
 * to open in the real browser and the answer has to come back somehow. The way
 * back is a loopback server: a throwaway HTTP listener on 127.0.0.1 that exists
 * for the length of one sign-in.
 *
 * The alternative -- registering a `nekan://` protocol -- needs an OS-level
 * association that `npm start` does not have, so the flow could never be tried
 * outside a packaged build. Loopback works identically in both.
 *
 * Nothing here knows what a session is. It hands back an authorization code and
 * the verifier that goes with it; api-client.js turns those into tokens, so
 * there stays exactly one file that owns credentials.
 */

import crypto from "crypto";
import http from "http";
import { app, shell } from "electron";

import { language, t } from "./i18n";

/** Long enough that a user can read a consent screen, short enough to give up. */
const WINDOW_MS = 5 * 60 * 1000;

/** Only ever one sign-in at a time; a second press replaces the first. */
let pending = null;

const base64url = (buffer) =>
  buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/**
 * The PKCE pair.
 *
 * The verifier never leaves this process; only its hash goes to the browser.
 * That is what stops whoever can see the redirect (any other program listening
 * on loopback, a browser extension) from turning the code into a session.
 */
function pkcePair() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(
    crypto.createHash("sha256").update(verifier).digest(),
  );
  return { verifier, challenge };
}

/**
 * What the browser tab says once it has done its job.
 *
 * The app ships Pretendard but this page is drawn by the system browser, so it
 * can only ask for an installed copy before falling back. Serving the 2MB file
 * over loopback for a line of text that is on screen for a second is not worth
 * the route.
 */
function donePage(message) {
  return `<!doctype html><html lang="${language()}"><head><meta charset="utf-8">
<title>Nekan</title><style>
body{margin:0;height:100vh;display:grid;place-items:center;background:#f7f5ef;
color:#23211d;font:16px/1.6 "Pretendard Variable","Pretendard","Malgun Gothic","Segoe UI",system-ui,sans-serif}
@media(prefers-color-scheme:dark){body{background:#171614;color:#e8e4da}}
p{margin:0}</style></head><body><p>${message}</p></body></html>`;
}

/**
 * Run one sign-in and resolve with the authorization code.
 *
 * `buildUrl` is handed the redirect URI once the port is known, because the
 * port is not known until the listener is up.
 */
/** Either the code the browser came back with, or why it did not. */
type LoopbackResult = { ok: true; code: string } | { ok: false; error: string };

function loopbackCode(
  buildUrl: (redirect: string) => string,
): Promise<LoopbackResult> {
  if (pending) pending.abandon("replaced");

  // Proof that a callback is answering *our* request. Without it, anything
  // else on this machine that can reach loopback -- another program, a browser
  // extension -- can cancel a sign-in by hitting /callback?error= first. The
  // verification procedure in CLAUDE.md does exactly that on purpose.
  const state = base64url(crypto.randomBytes(16));

  return new Promise<LoopbackResult>((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout | null = null;

    const finish = (result: LoopbackResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      pending = null;
      server.close();
      resolve(result);
    };

    const server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      // A favicon request, a stray probe, or a callback we did not start --
      // none of them may end the flow.
      //
      // The state is a path segment rather than a query parameter because
      // Supabase appends `?code=...` to whatever `redirect_to` it was given,
      // and a redirect_to that already carried a query string would depend on
      // how it joins the two. A path cannot be ambiguous. (Both shapes pass
      // the redirect allow-list -- that part was checked.)
      if (url.pathname !== `/callback/${state}`) {
        res.writeHead(404).end();
        return;
      }

      const code = url.searchParams.get("code");
      // The code first, the description second. `access_denied` is something
      // the UI has a sentence for in the user's own language; "User denied the
      // request" is prose from a service they never heard of.
      const error =
        url.searchParams.get("error") ||
        url.searchParams.get("error_description");

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        // Never "you are signed in": all that has happened is that a code came
        // back, and it can still be refused a moment later. The app is where
        // the answer is, so this page's job is to send the user there.
        donePage(t(code ? "oauth.done" : "oauth.failed")),
      );

      finish(
        code ? { ok: true, code } : { ok: false, error: error || "denied" },
      );
    });

    server.on("error", () => finish({ ok: false, error: "no_loopback" }));

    // Port 0: the OS picks a free one. Supabase's redirect allow-list has to
    // accept the wildcard `http://127.0.0.1:*` for this; if it ever does not,
    // this is the one line that has to become a fixed number.
    // Claimed before listen(), not inside its callback: binding a port is
    // asynchronous, and a second press arriving in that window would find
    // `pending` still null, leave this attempt unreplaced, and hold two
    // servers open until the five-minute timeout closed the first.
    pending = { abandon: (why) => finish({ ok: false, error: why }) };

    server.listen(0, "127.0.0.1", () => {
      // listen() has run, so this is an AddressInfo and not the string a
      // Unix-socket server would answer with.
      const { port } = server.address() as import("net").AddressInfo;
      timer = setTimeout(
        () => finish({ ok: false, error: "timeout" }),
        WINDOW_MS,
      );
      const redirect = `http://127.0.0.1:${port}/callback/${state}`;
      // Only outside a packaged build, and only so the flow stays testable:
      // the callback can be driven by hand to check the refusal paths, and
      // guessing the state is the one thing a tester cannot do.
      if (!app.isPackaged) console.log("oauth callback:", redirect);
      shell
        .openExternal(buildUrl(redirect))
        .catch(() => finish({ ok: false, error: "no_browser" }));
    });
  });
}

/** Give up on a sign-in nobody is waiting for any more. */
function cancelSignIn() {
  if (pending) pending.abandon("cancelled");
}

export { pkcePair, loopbackCode, cancelSignIn };
