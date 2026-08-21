const test = require("node:test");
const assert = require("node:assert/strict");

const {
  REFRESH_SKEW_MS,
  sessionFromToken,
  sessionFromStored,
  needsRefresh,
  publicSession,
} = require("../out/shared/auth");

/** What Supabase's token endpoint actually answers, trimmed to what we read. */
function reply(over = {}) {
  return {
    access_token: "access-1",
    refresh_token: "refresh-1",
    expires_in: 3599,
    token_type: "bearer",
    user: { id: "user-uuid", email: "nekan-dev@example.com" },
    ...over,
  };
}

/* ------------------------------------------------------------------ shapes */

test("sessionFromToken keeps both tokens and the identity", () => {
  const session = sessionFromToken(reply(), 1_000_000);

  assert.equal(session.accessToken, "access-1");
  assert.equal(session.refreshToken, "refresh-1");
  assert.equal(session.userId, "user-uuid");
  assert.equal(session.email, "nekan-dev@example.com");
});

test("the deadline is measured from when the reply landed, not the server", () => {
  // expires_at is deliberately a lie here: it is the server's clock, and this
  // is the check that we never read it. Everything downstream compares against
  // Date.now(), so the deadline has to be built from our own clock.
  const session = sessionFromToken(
    reply({ expires_at: 9_999_999_999 }),
    1_000_000,
  );

  assert.equal(session.expiresAt, 1_000_000 + 3599 * 1000);
});

test("a reply missing either token is not a session", () => {
  assert.equal(sessionFromToken(reply({ access_token: undefined }), 0), null);
  // An access token with no refresh token is an hour of app that then logs
  // itself out, which is worse than never having logged in.
  assert.equal(sessionFromToken(reply({ refresh_token: "" }), 0), null);
  assert.equal(sessionFromToken(null, 0), null);
  assert.equal(sessionFromToken("400 Bad Request", 0), null);
});

test("a reply with no user object still logs in", () => {
  // Refreshes come back without one. Losing the email would be a cosmetic
  // regression; refusing the session would be a logout.
  const session = sessionFromToken(reply({ user: undefined }), 0);

  assert.equal(session.accessToken, "access-1");
  assert.equal(session.email, null);
  assert.equal(session.userId, null);
});

test("a missing expires_in expires immediately rather than never", () => {
  const session = sessionFromToken(reply({ expires_in: undefined }), 5_000);

  assert.equal(session.expiresAt, 5_000);
  assert.equal(needsRefresh(session, 5_000), true);
});

/* ------------------------------------------------------------------ stored */

test("sessionFromStored round-trips what writeSession would have saved", () => {
  const session = sessionFromToken(reply(), 1_000_000);
  const back = sessionFromStored(JSON.parse(JSON.stringify(session)));

  assert.deepEqual(back, session);
});

test("a stored session without a refresh token is worthless", () => {
  assert.equal(sessionFromStored({ accessToken: "a" }), null);
  assert.equal(sessionFromStored(null), null);
  assert.equal(sessionFromStored({}), null);
});

test("a stored session keeps its refresh token when the rest is gone", () => {
  // The refresh token is what holds the login. A file old enough to have lost
  // its access token should send the next caller to a refresh, not to a login
  // screen.
  const back = sessionFromStored({ refreshToken: "refresh-1" });

  assert.equal(back.refreshToken, "refresh-1");
  assert.equal(back.expiresAt, 0);
  assert.equal(needsRefresh(back, Date.now()), true);
});

/* ----------------------------------------------------------------- expiry */

test("needsRefresh turns true a full skew before the deadline", () => {
  const session = sessionFromToken(reply(), 0);
  const deadline = session.expiresAt;

  assert.equal(needsRefresh(session, deadline - REFRESH_SKEW_MS - 1), false);
  assert.equal(needsRefresh(session, deadline - REFRESH_SKEW_MS), true);
  assert.equal(needsRefresh(session, deadline + 1), true);
});

test("anything unusable counts as needing a refresh", () => {
  assert.equal(needsRefresh(null, 0), true);
  assert.equal(needsRefresh({ accessToken: "", expiresAt: 1e15 }, 0), true);
  // A NaN deadline must answer yes. It is written as a negated `>` for exactly
  // this: every comparison with NaN is false, so a plain `<` would have said
  // the token is good forever.
  assert.equal(needsRefresh({ accessToken: "a", expiresAt: NaN }, 0), true);
});

/* ----------------------------------------------------------------- leaking */

test("publicSession hands over the identity and nothing else", () => {
  const session = sessionFromToken(reply(), 0);
  const shown = publicSession(session);

  assert.deepEqual(shown, {
    email: "nekan-dev@example.com",
    userId: "user-uuid",
  });
});

test("no field of a session reaches the renderer unless it was named", () => {
  // The real check is this one: publicSession picks, so a field added to the
  // session later cannot escape by being forgotten in a delete list.
  const shown = publicSession({
    ...sessionFromToken(reply(), 0),
    somethingAddedLater: "secret",
  });

  assert.deepEqual(Object.keys(shown).sort(), ["email", "userId"]);
  assert.equal(JSON.stringify(shown).includes("access-1"), false);
  assert.equal(JSON.stringify(shown).includes("refresh-1"), false);
});

test("publicSession of nobody is null, not an empty person", () => {
  assert.equal(publicSession(null), null);
});
