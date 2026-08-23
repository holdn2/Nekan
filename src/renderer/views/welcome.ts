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

import { messageOf } from "../errors.js";
import { $ } from "../dom.js";
import { needsStartupChoice } from "../../shared/core.js";
import { activeCount } from "../store.js";
import { t, tNodes, wireLanguageSelect } from "../i18n.js";

/** Set by app.js: how a finished choice reaches the rest of the startup. */
let onDone: (choice: string) => void = () => {};
let busy = false;
/**
 * Whether the Google half already succeeded.
 *
 * Only matters when the sign-in worked but recording the choice did not: the
 * screen stays up so the answer can be retried, and pressing the button again
 * must not send someone through a consent screen they have already passed.
 */
let signedIn = false;
/** The first-run card's elements, by the id each one has in index.html. */
interface WelcomeEls {
  root: HTMLElement;
  sync: HTMLButtonElement;
  local: HTMLButtonElement;
  adopt: HTMLElement;
  adoptBox: HTMLInputElement;
  adoptText: HTMLElement;
  msg: HTMLElement;
}

// Looked up once and kept, because a push from main can arrive before the
// wiring has run. Named rather than a bag of HTMLElement, because a handful of
// these are form controls and the code reads `value`, `checked` and `disabled`
// off exactly those.
const els = {} as WelcomeEls;

/**
 * Failures worth naming. Anything else falls through as its own code, which is
 * something a user can quote back and I can search for.
 */
const REASONS = {
  offline: "account.error.offline",
  timeout: "account.error.timeout",
  denied: "account.error.cancelled",
  access_denied: "account.error.cancelled",
  cancelled: "account.error.cancelled",
  no_browser: "account.error.noBrowser",
  no_loopback: "account.error.noLoopback",
  no_secure_storage: "account.error.noSecureStorage",
  flow_state_not_found: "account.error.expired",
  bad_response: "account.error.badResponse",
};

function say(text: string, isError = false) {
  els.msg.textContent = text || "";
  els.msg.classList.toggle("error", Boolean(text) && isError);
}

/**
 * Is there a choice still to make? The rule lives in shared/core.js because
 * main asks it too — it is what keeps the window out of bar mode until this
 * screen is done with it.
 */
export const needsWelcome = needsStartupChoice;

/**
 * The merge line, written from scratch.
 *
 * Its own function because it is built once when the card opens and then
 * outlives every reason it had to be right: the count moves as tasks change,
 * and the language can move under it. Nothing redraws this card otherwise, so
 * whatever is on it stays until somebody rewrites it.
 */
export function relabelWelcome() {
  if (!els.adoptText || els.root.classList.contains("hidden")) return;
  const count = activeCount();
  // Written whole rather than as a number dropped into fixed markup — see the
  // same label in views/account.js.
  els.adoptText.replaceChildren(...tNodes("welcome.adopt", { count }));
  els.adopt.classList.toggle("hidden", count === 0);
}

/** Put it on screen, with the local-tasks question only if there are any. */
export function showWelcome() {
  els.root.classList.remove("hidden");
  relabelWelcome();
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
async function finish(choice: string) {
  const saved = await window.api.setStartupChoice(choice).catch(() => null);
  if (saved !== choice) {
    say(t("welcome.saveFailed"), true);
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

    say(t("account.finishInBrowser"));
    const result = await window.api
      .signInWithGoogle(adoptMode())
      .catch((err) => ({
        ok: false,
        error: messageOf(err),
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
      code in REASONS
        ? t((REASONS as Record<string, string>)[code])
        : t("account.signInFailed", { code }),
      true,
    );
  } finally {
    busy = false;
    els.sync.disabled = false;
    els.local.disabled = false;
  }
}

/**
 * Undo a sign-in that the local choice contradicts.
 *
 * Answers whether the session is really gone. A logout that did not land
 * leaves the mismatch in place, and closing the screen on it would hide the
 * one state this whole branch exists to prevent -- so the caller stops.
 */
async function signOut() {
  try {
    await window.api.logout();
  } catch (err) {
    say(
      t("welcome.signOutFailed", {
        code: messageOf(err),
      }),
      true,
    );
    return false;
  }
  signedIn = false;
  return true;
}

export function wireWelcome(done: (choice: string) => void) {
  onDone = done || (() => {});
  els.root = $("#welcome");
  els.sync = $("#welcomeSync");
  els.local = $("#welcomeLocal");
  els.adopt = $("#welcomeAdopt");
  els.adoptBox = $("#welcomeAdoptBox");
  els.adoptText = $("#welcomeAdoptText");
  els.msg = $("#welcomeMsg");

  // Opens in the real browser, like the guide tab's release-notes link. The
  // overlay covers the title bar, so there is nowhere else on this screen a
  // reader could reach it from.
  $("#welcomePrivacy").addEventListener("click", () =>
    window.api.openPrivacyPolicy(),
  );

  // Same reason: the gear is behind this screen. Switching here moves the one
  // in the settings panel too — see wireLanguageSelect.
  wireLanguageSelect($("#welcomeLanguage"));

  els.sync.addEventListener("click", chooseSync);
  els.local.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    els.sync.disabled = true;
    els.local.disabled = true;
    try {
      // Reachable only through the narrow gap the retry above opened: Google
      // succeeded, recording the choice did not, and the answer changed to
      // local on the second try. By then main has stored a session and pointed
      // sync at the account, so leaving it would give someone an app that
      // syncs behind a choice that said not to.
      if (signedIn && !(await signOut())) return;
      await finish("local");
    } finally {
      busy = false;
      els.sync.disabled = false;
      els.local.disabled = false;
    }
  });
}
