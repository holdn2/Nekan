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

const crypto = require("crypto");
const http = require("http");
const { shell } = require("electron");

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

/** What the browser tab says once it has done its job. */
function donePage(message) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>Nekan</title><style>
body{margin:0;height:100vh;display:grid;place-items:center;background:#f7f5ef;
color:#23211d;font:16px/1.6 "Malgun Gothic","Segoe UI",system-ui,sans-serif}
@media(prefers-color-scheme:dark){body{background:#171614;color:#e8e4da}}
p{margin:0}</style></head><body><p>${message}</p></body></html>`;
}

/**
 * Run one sign-in and resolve with the authorization code.
 *
 * `buildUrl` is handed the redirect URI once the port is known, because the
 * port is not known until the listener is up.
 */
function loopbackCode(buildUrl) {
  if (pending) pending.abandon("replaced");

  return new Promise((resolve) => {
    let settled = false;
    let timer = null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pending = null;
      server.close();
      resolve(result);
    };

    const server = http.createServer((req, res) => {
      // Anything that is not the redirect -- a favicon request, a stray probe --
      // must not end the flow.
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }

      const code = url.searchParams.get("code");
      // The code first, the description second. `access_denied` is something
      // the UI can turn into a Korean sentence; "User denied the request" is
      // English prose from a service the user never heard of.
      const error =
        url.searchParams.get("error") ||
        url.searchParams.get("error_description");

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        // Not "로그인되었습니다": all that has happened is that a code came
        // back, and it can still be refused a moment later. The app is where
        // the answer is, so this page's job is to send the user there.
        donePage(
          code
            ? "확인했습니다. 이 창을 닫고 앱으로 돌아가 주세요."
            : "로그인하지 못했습니다. 이 창은 닫으셔도 됩니다.",
        ),
      );

      finish(
        code ? { ok: true, code } : { ok: false, error: error || "denied" },
      );
    });

    server.on("error", () => finish({ ok: false, error: "no_loopback" }));

    // Port 0: the OS picks a free one. Supabase's redirect allow-list has to
    // accept the wildcard `http://127.0.0.1:*` for this; if it ever does not,
    // this is the one line that has to become a fixed number.
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      pending = { abandon: (why) => finish({ ok: false, error: why }) };
      timer = setTimeout(
        () => finish({ ok: false, error: "timeout" }),
        WINDOW_MS,
      );
      shell
        .openExternal(buildUrl(`http://127.0.0.1:${port}/callback`))
        .catch(() => finish({ ok: false, error: "no_browser" }));
    });
  });
}

/** Give up on a sign-in nobody is waiting for any more. */
function cancelSignIn() {
  if (pending) pending.abandon("cancelled");
}

module.exports = { pkcePair, loopbackCode, cancelSignIn };
