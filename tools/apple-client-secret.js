/**
 * Make the client secret Supabase needs for Sign in with Apple on the desktop.
 *
 * Apple's web flow does not take a fixed secret. It takes a JWT signed with a
 * Sign in with Apple key (.p8), and Apple refuses one that lives longer than
 * six months -- so this is not run once, it is run every time the last one is
 * about to expire. When it does expire, only the desktop's Apple sign-in fails;
 * the phone's system sheet never uses it. docs/DECISIONS.md (2026-09-15, the
 * desktop entry) is where the dates are written down.
 *
 * The secret is copied to the clipboard and never printed: it is a credential,
 * and terminal scrollback is a place it would stay. `--print` exists for a
 * machine without a clipboard command, and says so.
 *
 *   node tools/apple-client-secret.js --p8 <path> --key-id <10 chars>
 *        [--team-id 3PW3FZG3GR] [--client-id com.yoshi.nekan.signin]
 */

const crypto = require("crypto");
const fs = require("fs");
const { spawnSync } = require("child_process");

/** Apple's ceiling is 15777000 seconds. A day under it, so a clock is not a failure. */
const LIFETIME_S = 15777000 - 86400;

function args(argv) {
  const out = { teamId: "3PW3FZG3GR", clientId: "com.yoshi.nekan.signin" };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === "--print") out.print = true;
    else if (key === "--p8") out.p8 = argv[++i];
    else if (key === "--key-id") out.keyId = argv[++i];
    else if (key === "--team-id") out.teamId = argv[++i];
    else if (key === "--client-id") out.clientId = argv[++i];
    else throw new Error(`unknown argument: ${key}`);
  }
  if (!out.p8 || !out.keyId) {
    throw new Error("--p8 <path> and --key-id <id> are required");
  }
  return out;
}

const b64url = (buf) =>
  Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** The JWT Apple asks for: ES256, issued by the team, about the Services ID. */
function clientSecret({ pem, keyId, teamId, clientId, now }) {
  const header = { alg: "ES256", kid: keyId };
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + LIFETIME_S,
    aud: "https://appleid.apple.com",
    sub: clientId,
  };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  // JWTs want the raw r||s pair, not the DER that sign() gives by default.
  const signature = crypto.sign("sha256", Buffer.from(input), {
    key: pem,
    dsaEncoding: "ieee-p1363",
  });
  return { token: `${input}.${b64url(signature)}`, exp: payload.exp };
}

function copy(text) {
  const tool =
    process.platform === "win32"
      ? ["clip", []]
      : process.platform === "darwin"
        ? ["pbcopy", []]
        : ["xclip", ["-selection", "clipboard"]];
  const res = spawnSync(tool[0], tool[1], { input: text });
  return res.status === 0;
}

function main() {
  const opts = args(process.argv.slice(2));
  const pem = fs.readFileSync(opts.p8, "utf8");
  const now = Math.floor(Date.now() / 1000);
  const { token, exp } = clientSecret({ ...opts, pem, now });
  const expires = new Date(exp * 1000).toISOString().slice(0, 10);

  if (opts.print) {
    console.log(token);
  } else if (!copy(token)) {
    console.error("no clipboard command worked; run again with --print");
    process.exit(1);
  }
  console.log(
    `${opts.print ? "printed" : "copied to the clipboard"} -- ` +
      `Services ID ${opts.clientId}, key ${opts.keyId}, expires ${expires}`,
  );
}

if (require.main === module) main();

module.exports = { clientSecret, LIFETIME_S };
