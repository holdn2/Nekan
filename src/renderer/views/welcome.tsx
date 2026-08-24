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

import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { needsStartupChoice } from "../../shared/core.js";
import { messageOf } from "../../shared/errors.js";
import { t, wireLanguageSelect } from "../i18n.js";
import { activeCount } from "../store.js";
import { useRenderSignal } from "../react/use-store.js";
import { RichText } from "../react/rich-text.js";
import { GoogleMark, LaptopIcon } from "../react/brand-icons.js";

/**
 * Is there a choice still to make? The rule lives in shared/core.js because
 * main asks it too — it is what keeps the window out of bar mode until this
 * screen is done with it.
 */
export const needsWelcome = needsStartupChoice;

/**
 * Failures worth naming. Anything else falls through as its own code, which is
 * something a user can quote back and I can search for.
 */
const REASONS: Record<string, string> = {
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

/** Whether the card is up, and how a finished choice reaches the startup. */
let visible = false;
let onDone: (choice: string) => void = () => {};
let announce: () => void = () => {};

/** Put it on screen. The count on the merge line follows the store from here. */
export function showWelcome() {
  visible = true;
  announce();
}

/** Set by app.js before the card can be shown. */
export function wireWelcome(done: (choice: string) => void) {
  onDone = done;
}

function Welcome() {
  useRenderSignal();
  const [, redraw] = useState(0);
  announce = () => redraw((n) => n + 1);

  const [busy, setBusy] = useState(false);
  /**
   * Whether the Google half already succeeded.
   *
   * Only matters when the sign-in worked but recording the choice did not: the
   * screen stays up so the answer can be retried, and pressing the button again
   * must not send someone through a consent screen they have already passed.
   */
  const [signedIn, setSignedIn] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const [adopt, setAdopt] = useState(true);
  const picker = useRef<HTMLSelectElement>(null);

  // The gear is behind this overlay, so this is the only way to change language
  // before the question is answered. Switching here moves the settings panel's
  // picker too -- see wireLanguageSelect.
  useEffect(() => {
    if (picker.current) wireLanguageSelect(picker.current);
  }, []);

  // The overlay itself is index.html's -- it covers the window, title bar
  // included, and the stylesheet hides it by class.
  useEffect(() => {
    document.getElementById("welcome")?.classList.toggle("hidden", !visible);
  });

  if (!visible) return null;

  const count = activeCount();
  const say = (text: string, error = false) => setMessage({ text, error });

  /**
   * Record the answer, and only then take the screen down.
   *
   * The order is the point. Hiding first and writing afterwards means a failed
   * write leaves someone who has plainly answered the question being asked it
   * again on the next launch -- and, if they chose Google, asked it while
   * already signed in. Main returns the stored value, so a null is a write that
   * did not land.
   */
  const finish = async (choice: string) => {
    const saved = await window.api.setStartupChoice(choice).catch(() => null);
    if (saved !== choice) {
      say(t("welcome.saveFailed"), true);
      return;
    }
    visible = false;
    redraw((n) => n + 1);
    onDone(choice);
  };

  /** "합치기" unless the box was offered and turned off. */
  const adoptMode = () => (count === 0 || adopt ? "merge" : "replace");

  const chooseSync = async () => {
    if (busy) return;
    setBusy(true);
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
        .catch((err: unknown) => ({ ok: false, error: messageOf(err) }));

      if (result?.ok) {
        setSignedIn(true);
        await finish("sync");
        return;
      }
      // The screen stays up. A failed sign-in has not answered the question,
      // and dropping someone onto an empty matrix would look like it worked.
      const code = result?.error || "unknown";
      say(
        code in REASONS
          ? t(REASONS[code])
          : t("account.signInFailed", { code }),
        true,
      );
    } finally {
      setBusy(false);
    }
  };

  /**
   * Undo a sign-in that the local choice contradicts.
   *
   * Answers whether the session is really gone. A logout that did not land
   * leaves the mismatch in place, and closing the screen on it would hide the
   * one state this whole branch exists to prevent -- so the caller stops.
   */
  const signOut = async () => {
    try {
      // The resolved value is not inspected because there is nothing in it to
      // inspect: main ends the session locally and answers { ok: true } before
      // the revoke it fires is anywhere near the network. Logging out is
      // something the user decided; it is not allowed to fail because a
      // connection did. What can still fail is the call itself -- a handler
      // that threw, or a channel that is not there -- and that arrives here.
      await window.api.logout();
    } catch (err) {
      say(t("welcome.signOutFailed", { code: messageOf(err) }), true);
      return false;
    }
    setSignedIn(false);
    return true;
  };

  const chooseLocal = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Reachable only through the narrow gap the retry above opened: Google
      // succeeded, recording the choice did not, and the answer changed to
      // local on the second try. By then main has stored a session and pointed
      // sync at the account, so leaving it would give someone an app that
      // syncs behind a choice that said not to.
      if (signedIn && !(await signOut())) return;
      await finish("local");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <select
        ref={picker}
        className="settings-select welcome-lang"
        id="welcomeLanguage"
        aria-label={t("settings.language")}
      />
      <div className="welcome-card">
        <img className="welcome-logo" src="../assets/icon.png" alt="" />
        <h1>Nekan</h1>
        <p className="welcome-lede">{t("welcome.lede")}</p>

        <button
          className="welcome-choice recommended"
          type="button"
          disabled={busy}
          onClick={chooseSync}
        >
          <GoogleMark />
          <span className="welcome-choice-text">
            <b>
              <span>{t("welcome.syncTitle")}</span>
              {/* Markup rather than a CSS `content` string. It used to be one,
                  which put a word on screen that no catalogue could reach and
                  that the untranslated sweep could not see. */}
              <span className="welcome-badge">{t("welcome.recommended")}</span>
            </b>
            <small>{t("welcome.syncSub")}</small>
          </span>
        </button>

        <button
          className="welcome-choice"
          type="button"
          disabled={busy}
          onClick={chooseLocal}
        >
          <LaptopIcon />
          <span className="welcome-choice-text">
            <b>{t("welcome.localTitle")}</b>
            <small>{t("welcome.localSub")}</small>
          </span>
        </button>

        {/* Only when there is something to carry. A fresh install has nothing
            to decide and should not be handed a decision. */}
        {count > 0 ? (
          <label className="welcome-adopt">
            <input
              type="checkbox"
              checked={adopt}
              onChange={(e) => setAdopt(e.target.checked)}
            />
            {/* Written whole rather than as a number dropped into fixed markup
                — where the count falls in the sentence moves with the
                language. */}
            <span>
              <RichText k="welcome.adopt" params={{ count }} />
            </span>
          </label>
        ) : null}

        <p
          className={`welcome-msg${message?.error ? " error" : ""}`}
          role="status"
        >
          {message?.text ?? ""}
        </p>
        {/* The notice sits in the footer rather than under the sync button
            because this card has to fit a 760x520 window, and the sync button
            is the tallest thing in it. Both choices are still on screen. */}
        <p className="welcome-foot">
          <span>{t("welcome.foot")}</span>
          <span className="welcome-foot-legal">
            <span>{t("legal.notice")}</span>
            <button
              className="text-link"
              type="button"
              // Opens in the real browser, like the guide tab's release-notes
              // link. The overlay covers the title bar, so there is nowhere
              // else on this screen a reader could reach it from.
              onClick={() => window.api.openPrivacyPolicy()}
            >
              {t("legal.privacy")}
            </button>
          </span>
        </p>
      </div>
    </>
  );
}

/** Fill the overlay index.html left empty. Called once, from init(). */
export function mountWelcome() {
  const host = document.getElementById("welcome");
  if (host) createRoot(host).render(<Welcome />);
}
