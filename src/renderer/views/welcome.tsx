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
 *
 * welcome.css is down to one rule, and the overlay's own box is in index.html.
 * The card is 380px wide and was measured against a 760x520 window, which is
 * why nothing in here grows with the window except the space around it.
 */

import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { messageOf } from "../../shared/errors.js";
import { t } from "../i18n.js";
import { activeCount } from "../store.js";
import { useRenderSignal } from "../react/use-store.js";
import { cn } from "../react/cn.js";
import { LanguageSelect } from "../components/language-select.js";
import { WelcomeChoices } from "./welcome/choices.js";
import {
  isWelcomeVisible,
  reasonKey,
  setAnnounce,
  welcomeAnswered,
} from "./welcome/state.js";

export { needsWelcome, showWelcome, wireWelcome } from "./welcome/state.js";

export function Welcome() {
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

  /**
   * Give up on a sign-in that is not coming back.
   *
   * The consent screen is a window this app does not own, and closing it says
   * nothing to the loopback server waiting here -- so without this the promise
   * below stays unresolved until the five-minute timeout, and both choices sit
   * disabled the whole time with no way to answer the question.
   */
  const cancelSync = () => {
    window.api.cancelSignIn().catch(() => {});
  };

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
      {/* The gear is behind this overlay, so this is the only way to change
          language before the question on it is answered.

          Top-LEFT, because the two window buttons that stay usable are lifted
          above this overlay at the top-right and a control tucked under them
          would be one you cannot press. Out of the flow, so the card keeps the
          height it was measured at against a 760x520 window.

          It sits inside the title bar's strip, and a draggable region hands its
          mouse input to the OS rather than to the page -- so without the
          app-region property the dropdown simply never opens. Painting over the
          bar is not enough: the region is hit-tested from the CSS property, not
          from what is on top. Verified with a real click: the select did not
          even take focus. */}
      <LanguageSelect
        className="welcome-lang absolute top-[12px] left-[12px] [-webkit-app-region:no-drag]"
        id="welcomeLanguage"
        ariaLabel={t("settings.language")}
      />
      <div className="welcome-card w-full max-w-[380px] text-center">
        <img
          className="welcome-logo h-[36px] w-[36px]"
          src="../assets/icon.png"
          alt=""
        />
        <div className="welcome-text flex flex-col items-center justify-center gap-[10px]">
          <h1 className="mx-[0px] mt-md mb-2xs text-3xl tracking-tight">
            Nekan
          </h1>
          <p className="welcome-lede m-[0px] mb-6xl text-md text-muted">
            {t("welcome.lede")}
          </p>
        </div>
        <WelcomeChoices
          busy={busy}
          count={count}
          adopt={adopt}
          onAdopt={setAdopt}
          onSync={chooseSync}
          onLocal={chooseLocal}
        />

        {/* A reserved line, so a message appearing does not shove the footer
            down. 1.2em is one line of it. */}
        <p
          className={cn(
            "welcome-msg m-[0px] mt-lg min-h-[1.2em] text-sm",
            message?.error ? "text-danger" : "text-muted",
          )}
          role="status"
        >
          {message?.text ?? ""}
        </p>
        {/* Only while the browser has it. Outside the live region above, so a
            screen reader hears the sentence rather than the sentence and a
            button every time the message changes. */}
        {busy ? (
          <button
            className="text-link welcome-cancel mt-xs text-sm"
            type="button"
            onClick={cancelSync}
          >
            {t("common.cancel")}
          </button>
        ) : null}
        {/* The notice sits in the footer rather than under the sync button
            because this card has to fit a 760x520 window, and the sync button
            is the tallest thing in it. Both choices are still on screen. */}
        {/* Two rows, because there are two things being said: the choice is
            reversible, and signing in stores something. Run together they
            wrapped mid-sentence and left "다." stranded on a line of its own.

            break-keep is `word-break: keep-all`, and that is what stops it.
            Korean has no need of spaces to be readable, so the default breaks
            between syllables -- fine for a paragraph, wrong for two short lines
            where the break lands inside a word. */}
        <p
          className={cn(
            "welcome-foot mx-[0px] mt-4xl mb-[0px] grid justify-items-center",
            "gap-xs text-xs leading-snug text-faint break-keep text-pretty",
          )}
        >
          <span>{t("welcome.foot")}</span>
          {/* The link is the end of the sentence it belongs to, not a third
              line of its own. */}
          <span className="welcome-foot-legal inline">
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
