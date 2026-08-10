/**
 * The account block inside the settings panel, and the dot on the gear.
 *
 * Signing in is the only thing in this app that reaches the network on purpose,
 * so the two rules here are about honesty rather than layout: never say
 * "동기화됨" unless a sync came back saying so, and never let a failure pass
 * without a sentence. The dot only lights for the two states a person can act
 * on -- the same test the update button had to pass.
 */

import { $ } from "../dom.js";
import { toast } from "../components/toast.js";
import { activeCount } from "../store.js";
import { t, tNodes } from "../i18n.js";

/** Whether this build has the development password channel at all. */
let devLogin = false;
/** Guards a second press while the browser is still open. */
let signingIn = false;

const els = {};

/**
 * Both apply functions can be reached by a push that beat wireAccount(), so
 * they look the elements up on first use rather than assuming the wiring ran.
 */
function ready() {
  if (!els.out) cache();
  return els;
}

function cache() {
  els.gear = $("#settingsBtn");
  els.out = $("#accountOut");
  els.in = $("#accountIn");
  els.google = $("#googleBtn");
  els.adopt = $("#accountAdopt");
  els.adoptBox = $("#adoptLocal");
  els.adoptText = $("#adoptText");
  els.adoptHint = $("#adoptHint");
  els.dev = $("#devLogin");
  els.email = $("#accountEmail");
  els.state = $("#accountState");
  els.logout = $("#logoutBtn");
  els.danger = $("#accountDanger");
  els.leave = $("#leaveBtn");
  els.leaveConfirm = $("#leaveConfirm");
  els.leaveCancel = $("#leaveCancel");
  els.leaveGo = $("#leaveGo");
  els.msg = $("#accountMsg");
}

/**
 * Failure codes turned into sentences.
 *
 * Anything unrecognised falls through as itself rather than as "알 수 없는
 * 오류": a code on screen is something a user can quote and I can search for.
 */
const REASONS = {
  offline: "account.error.offline",
  timeout: "account.error.timeout",
  denied: "account.error.cancelled",
  access_denied: "account.error.cancelled",
  cancelled: "account.error.cancelled",
  // Google is configured but Supabase does not know about it, or the other way
  // round. Not a user's problem to solve, but saying so beats a bare code.
  provider_disabled: "account.error.providerDisabled",
  validation_failed: "account.error.validationFailed",
  // The code was already used, or too old. Pressing the button again is the
  // whole fix.
  flow_state_not_found: "account.error.expired",
  flow_state_expired: "account.error.expired",
  // An empty key, not a missing one: "replaced" means the user pressed the
  // button again and the second attempt owns the message now.
  replaced: "",
  no_browser: "account.error.noBrowser",
  no_loopback: "account.error.noLoopback",
  no_secure_storage: "account.error.noSecureStorage",
  invalid_credentials: "account.error.invalidCredentials",
  bad_response: "account.error.badResponse",
  // Only reachable from the delete path: the session went while the panel was
  // open. Nothing was deleted, and the account may or may not still exist.
  no_session: "account.error.noSession",
};

/** A failure code as a sentence. Unknown codes are shown as themselves — a code
 *  on screen is something a user can quote and I can search for. */
function reasonFor(code, fallbackKey) {
  if (code in REASONS) return REASONS[code] ? t(REASONS[code]) : "";
  return t(fallbackKey, { code });
}

/**
 * The message on screen, as the call that produced it rather than as text.
 *
 * Same reason `lastStatus` below is kept: the language can change while this
 * message is up, and both the sign-in result and the language picker live in
 * this one panel -- so "sign-in failed" would sit there in the old language
 * while everything around it moved. A thunk carries the interpolated bits (an
 * email, an error code) along without this file having to store them.
 */
let lastMessage = null;

/** `render` is a function returning the sentence, or null to clear the line. */
function say(render, isError = false) {
  ready();
  lastMessage = render ? { render, isError } : null;
  paintMessage();
}

/** Ask the last message for its words again, in whatever language is on now. */
function paintMessage() {
  const text = lastMessage ? lastMessage.render() : "";
  els.msg.textContent = text;
  els.msg.classList.toggle("error", Boolean(text) && lastMessage?.isError);
}

/* ------------------------------------------------------------------ status */

/** The last status main pushed, so a redraw can say it again in a new language. */
let lastStatus = null;

/** What the four states are called, in the settings panel. */
const LABELS = {
  off: null,
  syncing: "account.state.syncing",
  synced: "account.state.synced",
  pending: "account.state.pending",
  offline: "account.state.offline",
};

/**
 * `pending` is not a state main reports -- it is `synced` with something still
 * waiting. Deciding it here keeps main's status to facts and leaves the
 * wording in one place.
 */
function displayState(status) {
  if (!status || status.state === "off") return "off";
  if (status.state === "synced" && status.unsent > 0) return "pending";
  return status.state;
}

/**
 * The words go in the panel; the title bar gets a dot.
 *
 * The chip that used to live up there measured 56px against the 28px the
 * widest bar row has to spare, so it was dropped in bar mode -- which is the
 * mode this widget is usually left in, and therefore the one where "아직 안
 * 올라갔다" most needed saying. A dot costs no width, so it can stay.
 */
export function applySyncStatus(status) {
  ready();
  lastStatus = status;
  const state = displayState(status);
  const label = LABELS[state];

  // `count` rather than the old %n placeholder: it is the name i18next reserves
  // for the number a sentence is about, so a language that needs a plural form
  // can grow one in the catalogue without this line changing.
  const words = label ? t(label, { count: status.unsent }) : "";

  els.state.textContent = words;
  // Only `pending` and `offline` colour the dot; settings.css hides it for the
  // rest, because a widget that is fine should not be asking for attention.
  els.gear.dataset.sync = state;
  els.gear.title =
    state === "offline"
      ? t("account.gearOffline")
      : words
        ? t("account.gearState", { state: words })
        : t("settings.title");
}

/* ----------------------------------------------------------------- session */

/** Who is signed in, kept so a redraw can re-apply it without being told. */
let session = null;

/**
 * Redraw the block from what is already known.
 *
 * Called from render() because one part of it -- how many local tasks a
 * sign-in would carry up -- changes with the task list rather than with the
 * session. Reading it once at startup left it saying 0 forever.
 */
export function renderAccount() {
  applySession(session);
  // Not only the session. The sync words and the gear's tooltip are written by
  // a push from main and by nothing else, so after a language change they sat
  // in the old language until the next sync happened to arrive — measured, not
  // guessed. Anything this view caches has to be re-applied from the redraw.
  applySyncStatus(lastStatus);
  // And the message line, for the same reason -- the language picker is in this
  // very panel, so a sign-in result can be on screen when the language changes.
  paintMessage();
}

/** Show the signed-in half or the signed-out half, and the local-tasks offer. */
export function applySession(next) {
  ready();
  // Who this block was showing a moment ago. renderAccount() re-applies the
  // same session on every draw, so "changed" has to mean the identity moved,
  // not merely that this ran again.
  const was = session && session.userId;
  session = next;
  const changed = was !== (session && session.userId);
  const inside = Boolean(session && session.email);
  els.in.classList.toggle("hidden", !inside);
  els.out.classList.toggle("hidden", inside);
  els.dev.classList.toggle("hidden", inside || !devLogin);
  els.danger.classList.toggle("hidden", !inside);
  // Folded away whenever the account changes, not only when it goes away.
  // Signing out and straight back in as somebody else would otherwise hand the
  // new account an open "계정 삭제" that nobody there asked for.
  if (!inside || changed) closeConfirm();

  if (inside) {
    els.email.textContent = session.email;
    return;
  }

  // Only offered when there is something to lose. A fresh machine has no
  // decision to make and should not be handed one.
  const count = activeCount();
  // The whole sentence, not just the number: the count is bold and the words
  // around it swap sides between languages, so there is no fixed "before" and
  // "after" to leave sitting in the markup.
  els.adoptText.replaceChildren(...tNodes("account.adopt", { count }));
  els.adopt.classList.toggle("hidden", count === 0);
  els.adoptHint.classList.toggle("hidden", count === 0);
}

/** Guards a second press while the delete request is out. */
let deleting = false;

/** Back to just the quiet link, and the buttons usable again. */
function closeConfirm() {
  els.leaveConfirm.classList.add("hidden");
  els.leave.classList.remove("hidden");
  els.leaveGo.disabled = false;
  els.leaveCancel.disabled = false;
}

/** "합치기" unless the box was offered and turned off. */
const adoptMode = () =>
  els.adopt.classList.contains("hidden") || els.adoptBox.checked
    ? "merge"
    : "replace";

async function finish(promise) {
  signingIn = true;
  els.google.disabled = true;
  say(() => t("account.finishInBrowser"));
  try {
    // Rejects, rather than resolving with { ok: false }, when the channel is
    // not registered at all -- devLogin in a packaged build -- or when the
    // main handler throws. Uncaught it would be an unhandled rejection and the
    // panel would sit on "브라우저에서 로그인을 마쳐 주세요" forever.
    const result = await promise.catch((err) => ({
      ok: false,
      error: String((err && err.message) || err),
    }));
    if (result && result.ok) {
      applySession(result.session);
      say(
        result.session
          ? () => t("account.signedIn", { email: result.session.email })
          : null,
      );
      return;
    }
    const code = (result && result.error) || "unknown";
    say(() => reasonFor(code, "account.signInFailed"), true);
  } finally {
    signingIn = false;
    els.google.disabled = false;
  }
}

export function wireAccount() {
  cache();

  $("#accountPrivacy").addEventListener("click", () =>
    window.api.openPrivacyPolicy(),
  );

  els.google.addEventListener("click", () => {
    if (signingIn) return;
    finish(window.api.signInWithGoogle(adoptMode()));
  });

  els.dev.addEventListener("submit", (e) => {
    e.preventDefault();
    if (signingIn) return;
    finish(
      window.api.devLogin(
        $("#devEmail").value,
        $("#devPassword").value,
        adoptMode(),
      ),
    );
  });

  els.logout.addEventListener("click", async () => {
    try {
      await window.api.logout();
    } catch (err) {
      // The session is main's to end, so a failure here means it did not. Said
      // out loud rather than swallowed: the screen would otherwise show a
      // logout that never happened.
      const code = String((err && err.message) || err);
      say(() => t("account.signOutFailed", { code }), true);
      return;
    }
    applySession(null);
    applySyncStatus({ state: "off", unsent: 0 });
    say(() => t("account.signedOut"));
  });

  els.leave.addEventListener("click", () => {
    els.leave.classList.add("hidden");
    els.leaveConfirm.classList.remove("hidden");
    say(null);
  });

  els.leaveCancel.addEventListener("click", () => {
    if (deleting) return;
    closeConfirm();
  });

  els.leaveGo.addEventListener("click", async () => {
    if (deleting) return;
    deleting = true;
    els.leaveGo.disabled = true;
    els.leaveCancel.disabled = true;
    say(() => t("account.deleting"));
    try {
      // Unlike logout, this one is the server's to do, so a failure means the
      // account is still there. Saying nothing would leave a panel that looks
      // signed in with no explanation of what happened.
      const result = await window.api.deleteAccount().catch((err) => ({
        ok: false,
        error: String((err && err.message) || err),
      }));
      if (!result || !result.ok) {
        const code = (result && result.error) || "unknown";
        say(() => reasonFor(code, "account.deleteFailed"), true);
        els.leaveGo.disabled = false;
        els.leaveCancel.disabled = false;
        return;
      }
      // The delete landed, but the session it was for may not be the one on
      // screen any more: logging out and back in as somebody else while the
      // request was in flight leaves main holding a different session, which it
      // refuses to end. Showing "삭제했습니다" then would be telling the new
      // account its own account is gone.
      if (!result.signedOut) {
        say(null);
        return;
      }
      applySession(null);
      applySyncStatus({ state: "off", unsent: 0 });
      say(() => t("account.deleted"));
    } finally {
      deleting = false;
    }
  });
}

/** Called once from init, before the first applySession. */
export function setDevLogin(enabled) {
  devLogin = Boolean(enabled);
}

/**
 * An edit that had not been sent yet lost to another device's version.
 *
 * Said out loud, unlike a network failure. `실패는 조용히` is about things the
 * user cannot act on; this is the one sync outcome where something they wrote
 * is gone and they may want to write it again.
 */
export function announceOverwritten(count) {
  if (!count) return;
  toast(t("account.overwritten", { count }), { ms: 8000 });
}
