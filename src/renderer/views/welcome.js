/**
 * The screen a new install opens on.
 *
 * It exists because the alternative was worse: sync shipped with its only door
 * inside the guide tab, which is where someone goes to read about the app
 * rather than to set it up. A feature nobody can find is a feature nobody has.
 *
 * Shown whenever `settings.startupChoice` is null, which means a 1.0.2 file --
 * having no such key -- meets it once as well. That is the point. The choice
 * is not final either; the same two options live in the settings panel.
 */

import { $ } from "../dom.js";
import { activeCount } from "../store.js";

/** Set by app.js: how a finished choice reaches the rest of the startup. */
let onDone = () => {};
let busy = false;
/**
 * Whether the Google half already succeeded.
 *
 * Only matters when the sign-in worked but recording the choice did not: the
 * screen stays up so the answer can be retried, and pressing the button again
 * must not send someone through a consent screen they have already passed.
 */
let signedIn = false;
const els = {};

/**
 * Failures worth naming. Anything else falls through as its own code, which is
 * something a user can quote back and I can search for.
 */
const REASONS = {
  offline: "인터넷에 연결되어 있지 않습니다.",
  timeout: "시간이 초과됐습니다. 다시 시도해 주세요.",
  denied: "로그인이 취소되었습니다.",
  access_denied: "로그인이 취소되었습니다.",
  cancelled: "로그인이 취소되었습니다.",
  no_browser: "브라우저를 열지 못했습니다.",
  no_loopback: "로그인 창을 여는 데 실패했습니다. 방화벽 설정을 확인해 주세요.",
  no_secure_storage:
    "이 컴퓨터에서는 로그인 정보를 안전하게 저장할 수 없어 로그인하지 않습니다.",
  flow_state_not_found: "로그인이 만료되었습니다. 다시 시도해 주세요.",
  bad_response: "서버 응답을 이해하지 못했습니다.",
};

function say(text, isError = false) {
  els.msg.textContent = text || "";
  els.msg.classList.toggle("error", Boolean(text) && isError);
}

/** Is there a choice still to make? */
export const needsWelcome = (choice) => choice !== "sync" && choice !== "local";

/** Put it on screen, with the local-tasks question only if there are any. */
export function showWelcome() {
  const count = activeCount();
  els.count.textContent = count;
  els.adopt.classList.toggle("hidden", count === 0);
  els.root.classList.remove("hidden");
}

/**
 * Record the answer, and only then take the screen down.
 *
 * The order is the point. Hiding first and writing afterwards means a failed
 * write leaves someone who has plainly answered the question being asked it
 * again on the next launch -- and, if they chose Google, asked it while
 * already signed in. Main returns the stored value, so a null is a write that
 * did not land.
 */
async function finish(choice) {
  const saved = await window.api.setStartupChoice(choice).catch(() => null);
  if (saved !== choice) {
    say("설정을 저장하지 못했습니다. 다시 시도해 주세요.", true);
    return;
  }
  els.root.classList.add("hidden");
  onDone(choice);
}

/** "합치기" unless the box was offered and turned off. */
const adoptMode = () =>
  els.adopt.classList.contains("hidden") || els.adoptBox.checked
    ? "merge"
    : "replace";

async function chooseSync() {
  if (busy) return;
  busy = true;
  els.sync.disabled = true;
  els.local.disabled = true;
  try {
    // Already through the consent screen, and only the write failed. Retry
    // that alone -- sending someone back to Google would be asking them to
    // approve something they just approved.
    if (signedIn) {
      await finish("sync");
      return;
    }

    say("브라우저에서 로그인을 마쳐 주세요.");
    const result = await window.api
      .signInWithGoogle(adoptMode())
      .catch((err) => ({
        ok: false,
        error: String((err && err.message) || err),
      }));

    if (result && result.ok) {
      signedIn = true;
      await finish("sync");
      return;
    }
    // The screen stays up. A failed sign-in has not answered the question, and
    // dropping someone onto an empty matrix would look like it worked.
    const code = (result && result.error) || "unknown";
    say(
      code in REASONS ? REASONS[code] : `로그인하지 못했습니다. (${code})`,
      true,
    );
  } finally {
    busy = false;
    els.sync.disabled = false;
    els.local.disabled = false;
  }
}

export function wireWelcome(done) {
  onDone = done || (() => {});
  els.root = $("#welcome");
  els.sync = $("#welcomeSync");
  els.local = $("#welcomeLocal");
  els.adopt = $("#welcomeAdopt");
  els.adoptBox = $("#welcomeAdoptBox");
  els.count = $("#welcomeCount");
  els.msg = $("#welcomeMsg");

  els.sync.addEventListener("click", chooseSync);
  els.local.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    els.sync.disabled = true;
    els.local.disabled = true;
    try {
      await finish("local");
    } finally {
      busy = false;
      els.sync.disabled = false;
      els.local.disabled = false;
    }
  });
}
