/**
 * The account block inside the settings panel, and the dot on the gear.
 *
 * Signing in is the only thing in this app that reaches the network on purpose,
 * so the two rules here are about honesty rather than layout: never say
 * "동기화됨" unless a sync came back saying so, and never let a failure pass
 * without a sentence. The dot only lights for the two states a person can act
 * on -- the same test the update button had to pass.
 *
 * account.css is gone; the two halves and everything in them are spelled here
 * and in ./account/. `hidden` on either half is written by hand rather than
 * through cn(), and that is on purpose: cn() would see `flex` and `hidden` as
 * one display and drop the `flex`, leaving markup that no longer says what the
 * block is when it comes back. The utility layer emits `hidden` after `flex`,
 * so writing both is both honest and correct -- and it is what index.html does
 * with the settings panel.
 */

import { useEffect, useState } from "react";
import { messageOf } from "../../shared/errors.js";
import { t } from "../i18n.js";
import { activeCount } from "../store.js";
import { useRenderSignal } from "../react/use-store.js";
import { cn } from "../react/cn.js";
import { RichText } from "../react/rich-text.js";
import { GoogleMark } from "../react/brand-icons.js";
import { Button } from "../components/ui/button.js";

/** What a sign-in answers with: the session when it worked, a code when not. */
import type { Message, SignInResult } from "./account/status.js";
import { DevSignIn } from "./account/dev-sign-in.js";
import { DeleteAccount } from "./account/delete-account.js";
import {
  LABELS,
  applySession,
  applySyncStatus,
  currentSession,
  currentStatus,
  devLoginOffered,
  displayState,
  reasonFor,
} from "./account/status.js";

export {
  applySession,
  applySyncStatus,
  setDevLogin,
  announceOverwritten,
} from "./account/status.js";

/**
 * One of the two halves. Exactly one is on screen; the other carries `hidden`.
 *
 * Both wrap, because this block lives in a 320px panel rather than in the width
 * of the guide it came from.
 */
const HALF = "flex flex-wrap items-center gap-lg";

/**
 * A line of small print under a control, on its own row.
 *
 * -2px is not on the spacing scale and is not rounded onto it: it pulls the
 * sentence back up against the thing it explains, and which step it is nearest
 * is not the question.
 */
const HINT = "account-hint m-[0px] mt-[-2px] basis-full text-sm text-muted";

export function Account() {
  useRenderSignal();
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);
  const [adopt, setAdopt] = useState(true);

  const inside = Boolean(currentSession()?.email);
  const state = displayState(currentStatus());
  const label = LABELS[state];
  // `count` rather than the old %n placeholder: it is the name i18next reserves
  // for the number a sentence is about, so a language that needs a plural form
  // can grow one in the catalogue without this line changing.
  const words = label ? t(label, { count: currentStatus()?.unsent ?? 0 }) : "";

  // The gear is in the title bar, outside anything this panel draws. Only
  // `pending` and `offline` colour its dot; settings.css hides it for the rest,
  // because a widget that is fine should not be asking for attention.
  useEffect(() => {
    const gear = document.getElementById("settingsBtn");
    if (!gear) return;
    gear.dataset.sync = state;
    // Both, or the label a screen reader reads is the plain one the title bar
    // draws while the tooltip a pointer sees says something else.
    const name =
      state === "offline"
        ? t("account.gearOffline")
        : words
          ? t("account.gearState", { state: words })
          : t("settings.title");
    gear.title = name;
    gear.ariaLabel = name;
  });

  const say = (render: (() => string) | null, isError = false) =>
    setMessage(render ? { render, isError } : null);

  /** Only offered when there is something to lose. */
  const count = activeCount();
  /** "합치기" unless the box was offered and turned off. */
  const adoptMode = () => (count === 0 || adopt ? "merge" : "replace");

  const finish = async (promise: Promise<SignInResult>) => {
    if (busy) return;
    setBusy(true);
    say(() => t("account.finishInBrowser"));
    try {
      // Rejects, rather than resolving with { ok: false }, when the channel is
      // not registered at all -- the dev channel in a packaged build -- or when the
      // main handler throws. Uncaught it would be an unhandled rejection and
      // the panel would sit on "브라우저에서 로그인을 마쳐 주세요" forever.
      const result = await promise.catch((err): SignInResult => ({
        ok: false,
        error: messageOf(err),
      }));
      if (result?.ok) {
        const signed = result.session ?? null;
        applySession(signed);
        say(
          signed ? () => t("account.signedIn", { email: signed.email }) : null,
        );
        return;
      }
      const code = result?.error || "unknown";
      say(() => reasonFor(code, "account.signInFailed"), true);
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    try {
      await window.api.logout();
    } catch (err) {
      // The session is main's to end, so a failure here means it did not. Said
      // out loud rather than swallowed: the screen would otherwise show a
      // logout that never happened.
      const code = messageOf(err);
      say(() => t("account.signOutFailed", { code }), true);
      return;
    }
    applySession(null);
    applySyncStatus({ state: "off", unsent: 0 });
    say(() => t("account.signedOut"));
  };

  const privacy = (
    <button
      className="text-link"
      type="button"
      onClick={() => window.api.openPrivacyPolicy()}
    >
      {t("legal.privacy")}
    </button>
  );

  return (
    <>
      <div className={`account-out ${HALF}${inside ? " hidden" : ""}`}>
        {/* Google asks that its button keep white/grey chrome and the wordmark
            colours, which is why this one does not follow the app's button
            styling. Those four literals are the only colours in the app that do
            not come from a token, and they must stay that way: pointing them at
            the palette would make the button follow the theme, which is the
            thing the guidelines forbid. If a sweep reports "4 hardcoded
            colours", this is all of them.

            The type is ours, so it goes through the tokens and follows the app
            if the family or the scale changes. It was one `font:` shorthand;
            that cannot come back as an arbitrary property, because those are
            emitted after the leading-* utilities and would carry an inherited
            line-height -- so the four parts are asked for by name.

            This is the one button in this file that is NOT a ui/button, and
            that is the point: every variant ui/button has sets a background,
            and this one's background is Google's to decide. Handing it
            `outline` and then overriding four of its utilities back would be
            the same markup with a component in the way of it. */}
        <button
          className={cn(
            "google-btn inline-flex items-center gap-md rounded-sm border",
            "border-[#dadce0] bg-[#fff] px-3xl py-md text-[#3c4043]",
            "hover:bg-[#f7f8f8]",
            "font-sans text-md leading-none font-medium",
            "disabled:cursor-default disabled:opacity-[0.55]",
          )}
          type="button"
          disabled={busy}
          onClick={() => finish(window.api.signInWithGoogle(adoptMode()))}
        >
          <GoogleMark />
          <span>{t("account.google")}</span>
        </button>

        {/* The other door into the same decision. Signing in is reachable from
            here as well as the first-run card, so the notice has to be in both
            or it leaks out of one of them. */}
        <p className={HINT}>
          <span>{t("legal.notice")}</span>
          {privacy}
        </p>

        {/* Only shown when there is something to lose. Somebody signing in on a
            fresh machine has no decision to make. */}
        {count > 0 ? (
          <>
            {/* Not a flex row. The words around the count would each become
                their own flex item, and at the panel's 320px that breaks the
                sentence into three stacked pieces. */}
            <label className="account-adopt block basis-full cursor-pointer text-sm leading-normal text-muted">
              <input
                className="mr-sm align-[-1px]"
                type="checkbox"
                checked={adopt}
                onChange={(e) => setAdopt(e.target.checked)}
              />
              {/* The count is bold and the words around it change places
                  between languages, so the whole sentence is one string and
                  the <b> travels inside it. */}
              <span>
                <RichText k="account.adopt" params={{ count }} />
              </span>
            </label>
            <p className={HINT}>{t("account.adoptHint")}</p>
          </>
        ) : null}

        {/* A development run only. The shipped app never registers this
            channel -- see main/ipc/auth.ts. */}
        {devLoginOffered() && !inside ? (
          <DevSignIn
            onSubmit={(email, password) =>
              finish(window.api.devLogin(email, password, adoptMode()))
            }
          />
        ) : null}
      </div>

      <div className={`account-in ${HALF}${inside ? "" : " hidden"}`}>
        <span className="account-who font-medium">
          {currentSession()?.email ?? ""}
        </span>
        <span className="account-state text-sm text-muted">{words}</span>
        {/* The notice above this lives in the signed-out block, which is
            hidden by then -- this is the only copy a signed-in person sees. */}
        {privacy}
        {/* `outline` is ui/button's neutral bordered variant, which is what
            this was spelling out by hand: a hairline in `line`, no fill of its
            own, and the text going from `muted` to `text` on hover. The one
            thing that moved is where the hover shows -- outline fills with
            `panel-2` instead of darkening the border. */}
        <Button
          className="account-out-btn ml-auto text-muted"
          variant="outline"
          size="sm"
          type="button"
          onClick={signOut}
        >
          {t("account.signOut")}
        </Button>
      </div>

      {/* Only shown while signed in. Two steps on purpose: the first press
          opens the explanation, the second one acts. "탈퇴" reads as
          "everything goes", so what stays has to be said before the
          irreversible button is on screen -- not in a toast afterwards. */}
      <DeleteAccount visible={inside} say={say} />

      <p
        className={cn(
          "account-msg m-[0px] mt-lg min-h-[1.2em] text-sm",
          // A reserved line, so a message appearing does not shove the rest of
          // the panel down. 1.2em is the height of one line of it.
          message?.isError ? "text-danger" : "text-muted",
        )}
        role="status"
      >
        {message ? message.render() : ""}
      </p>
      {/* Same as the first-run card: the consent screen is a window this app
          does not own, and closing it tells the loopback server nothing. Kept
          outside the live region above for the same reason it is there. */}
      {busy ? (
        // [align-self:start] rather than self-start: the utility is
        // `flex-start`, and this carries the declaration across as it was.
        // It does nothing today -- the panel is not a flex container -- but it
        // is the twin of the first-run card's cancel, where it does.
        <button
          className="text-link account-cancel mt-xs text-sm [align-self:start]"
          type="button"
          onClick={() => window.api.cancelSignIn().catch(() => {})}
        >
          {t("common.cancel")}
        </button>
      ) : null}
    </>
  );
}
