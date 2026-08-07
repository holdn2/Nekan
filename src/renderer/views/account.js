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
  els.adoptCount = $("#adoptCount");
  els.adoptHint = $("#adoptHint");
  els.dev = $("#devLogin");
  els.email = $("#accountEmail");
  els.state = $("#accountState");
  els.logout = $("#logoutBtn");
  els.msg = $("#accountMsg");
}

/**
 * Failure codes turned into sentences.
 *
 * Anything unrecognised falls through as itself rather than as "알 수 없는
 * 오류": a code on screen is something a user can quote and I can search for.
 */
const REASONS = {
  offline: "인터넷에 연결되어 있지 않습니다.",
  timeout: "시간이 초과됐습니다. 다시 시도해 주세요.",
  denied: "로그인이 취소되었습니다.",
  access_denied: "로그인이 취소되었습니다.",
  cancelled: "로그인이 취소되었습니다.",
  // Google is configured but Supabase does not know about it, or the other way
  // round. Not a user's problem to solve, but saying so beats a bare code.
  provider_disabled: "아직 Google 로그인을 쓸 수 없습니다.",
  validation_failed: "로그인 설정이 아직 끝나지 않았습니다.",
  // The code was already used, or too old. Pressing the button again is the
  // whole fix.
  flow_state_not_found: "로그인이 만료되었습니다. 다시 시도해 주세요.",
  flow_state_expired: "로그인이 만료되었습니다. 다시 시도해 주세요.",
  replaced: "",
  no_browser: "브라우저를 열지 못했습니다.",
  no_loopback: "로그인 창을 여는 데 실패했습니다. 방화벽 설정을 확인해 주세요.",
  no_secure_storage:
    "이 컴퓨터에서는 로그인 정보를 안전하게 저장할 수 없어 로그인하지 않습니다.",
  invalid_credentials: "이메일 또는 비밀번호가 맞지 않습니다.",
  bad_response: "서버 응답을 이해하지 못했습니다.",
};

function say(text, isError = false) {
  ready();
  els.msg.textContent = text || "";
  els.msg.classList.toggle("error", Boolean(text) && isError);
}

/* ------------------------------------------------------------------ status */

/** What the four states are called, in the settings panel. */
const LABELS = {
  off: null,
  syncing: "동기화 중",
  synced: "동기화됨",
  pending: "대기 %n개",
  offline: "오프라인",
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
  const state = displayState(status);
  const label = LABELS[state];

  els.state.textContent = label ? label.replace("%n", status.unsent) : "";
  // Only `pending` and `offline` colour the dot; settings.css hides it for the
  // rest, because a widget that is fine should not be asking for attention.
  els.gear.dataset.sync = state;
  els.gear.title =
    state === "offline"
      ? "설정 — 서버에 닿지 못했습니다. 변경은 이 컴퓨터에 저장되어 있습니다."
      : label
        ? `설정 — ${label.replace("%n", status.unsent)}`
        : "설정";
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
}

/** Show the signed-in half or the signed-out half, and the local-tasks offer. */
export function applySession(next) {
  ready();
  session = next;
  const inside = Boolean(session && session.email);
  els.in.classList.toggle("hidden", !inside);
  els.out.classList.toggle("hidden", inside);
  els.dev.classList.toggle("hidden", inside || !devLogin);

  if (inside) {
    els.email.textContent = session.email;
    return;
  }

  // Only offered when there is something to lose. A fresh machine has no
  // decision to make and should not be handed one.
  const count = activeCount();
  els.adoptCount.textContent = count;
  els.adopt.classList.toggle("hidden", count === 0);
  els.adoptHint.classList.toggle("hidden", count === 0);
}

/** "합치기" unless the box was offered and turned off. */
const adoptMode = () =>
  els.adopt.classList.contains("hidden") || els.adoptBox.checked
    ? "merge"
    : "replace";

async function finish(promise) {
  signingIn = true;
  els.google.disabled = true;
  say("브라우저에서 로그인을 마쳐 주세요.");
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
          ? `${result.session.email} 계정으로 로그인했습니다.`
          : "",
      );
      return;
    }
    const code = (result && result.error) || "unknown";
    // An empty reason is a deliberate silence: "replaced" means the user
    // pressed the button again, and the second attempt owns the message now.
    const reason =
      code in REASONS ? REASONS[code] : `로그인하지 못했습니다. (${code})`;
    say(reason, true);
  } finally {
    signingIn = false;
    els.google.disabled = false;
  }
}

export function wireAccount() {
  cache();

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
      say(
        `로그아웃하지 못했습니다. (${String((err && err.message) || err)})`,
        true,
      );
      return;
    }
    applySession(null);
    applySyncStatus({ state: "off", unsent: 0 });
    say("로그아웃했습니다. 이 컴퓨터의 할 일은 그대로 있습니다.");
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
  toast(`다른 기기에서 바꾼 내용으로 ${count}개를 덮어썼습니다.`, { ms: 8000 });
}
