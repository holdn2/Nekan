/**
 * The Apple client secret is a JWT that Apple checks and nobody else reads.
 *
 * It is made twice a year, from a key nobody keeps in the repository, and a
 * wrong one fails only at the moment someone signs in with Apple on the
 * desktop -- in a browser, with an error from Apple. So the shape is pinned
 * here with a throwaway key: the algorithm, the claims Apple requires, a
 * lifetime under its ceiling, and a signature in the raw r||s form a JWT
 * needs rather than the DER Node's sign() writes by default.
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { args, clientSecret, LIFETIME_S } from "#tools/apple-client-secret.js";

const decode = (part: string) =>
  JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

function throwaway() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  return {
    pem: privateKey.export({ type: "pkcs8", format: "pem" }) as string,
    publicKey,
  };
}

test("the secret is an ES256 JWT with the claims Apple requires", () => {
  const { pem } = throwaway();
  const now = 1_758_000_000;
  const { token, exp } = clientSecret({
    pem,
    keyId: "ABCDE12345",
    teamId: "3PW3FZG3GR",
    clientId: "com.yoshi.nekan.signin",
    now,
  });
  const [header, payload] = token.split(".");
  assert.deepEqual(decode(header), { alg: "ES256", kid: "ABCDE12345" });
  assert.deepEqual(decode(payload), {
    iss: "3PW3FZG3GR",
    iat: now,
    exp,
    aud: "https://appleid.apple.com",
    sub: "com.yoshi.nekan.signin",
  });
  // Apple refuses anything past 15777000 seconds.
  assert.ok(exp - now === LIFETIME_S && LIFETIME_S < 15_777_000);
});

test("the signature verifies with the key's public half, and only with it", () => {
  const { pem, publicKey } = throwaway();
  const { token } = clientSecret({
    pem,
    keyId: "K",
    teamId: "T",
    clientId: "C",
    now: 0,
  });
  const [header, payload, signature] = token.split(".");
  const signed = Buffer.from(`${header}.${payload}`);
  const raw = Buffer.from(signature, "base64url");
  // 64 bytes is r||s for P-256; DER would be 70 or so and Apple would reject it.
  assert.equal(raw.length, 64);
  const verify = (key: crypto.KeyObject) =>
    crypto.verify("sha256", signed, { key, dsaEncoding: "ieee-p1363" }, raw);
  assert.equal(verify(publicKey), true);
  assert.equal(verify(throwaway().publicKey), false);
});

test("a flag without a value is a usage error, not a path", () => {
  assert.throws(() => args(["--p8", "--key-id", "X"]), /--p8 needs a value/);
  assert.throws(() => args(["--key-id"]), /--key-id needs a value/);
  assert.throws(() => args(["--p8", "k.p8"]), /are required/);
  assert.deepEqual(args(["--p8", "k.p8", "--key-id", "X"]), {
    teamId: "3PW3FZG3GR",
    clientId: "com.yoshi.nekan.signin",
    p8: "k.p8",
    keyId: "X",
  });
});
