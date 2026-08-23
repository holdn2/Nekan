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
import { messageOf } from "../../shared/errors.js";
import { t, wireLanguageSelect } from "../i18n.js";
import { activeCount } from "../store.js";
import { useRenderSignal } from "../react/use-store.js";
import { WelcomeChoices } from "./welcome/choices.js";
import {
  isWelcomeVisible,
  reasonKey,
  setAnnounce,
  welcomeAnswered,
} from "./welcome/state.js";

export { needsWelcome, showWelcome, wireWelcome } from "./welcome/state.js";

function Welcome() {
  useRenderSignal();
  const [, redraw] = useState(0);
  setAnnounce(() => redraw((n) => n + 1));

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
    document
      .getElementById("welcome")
      ?.classList.toggle("hidden", !isWelcomeVisible());
  });

  if (!isWelcomeVisible()) return null;

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
    welcomeAnswered(choice);
    redraw((n) => n + 1);
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
      const known = reasonKey(code);
      say(known ? t(known) : t("account.signInFailed", { code }), true);
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
        <div className="welcome-text">
          <h1>Nekan</h1>
          <p className="welcome-lede">{t("welcome.lede")}</p>
        </div>
        <WelcomeChoices
          busy={busy}
          count={count}
          adopt={adopt}
          onAdopt={setAdopt}
          onSync={chooseSync}
          onLocal={chooseLocal}
        />

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
