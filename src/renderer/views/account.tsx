/**
 * The account block inside the settings panel, and the dot on the gear.
 *
 * Signing in is the only thing in this app that reaches the network on purpose,
 * so the two rules here are about honesty rather than layout: never say
 * "동기화됨" unless a sync came back saying so, and never let a failure pass
 * without a sentence. The dot only lights for the two states a person can act
 * on -- the same test the update button had to pass.
 */

import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { messageOf } from "../../shared/errors.js";
import { t } from "../i18n.js";
import { activeCount } from "../store.js";
import { useRenderSignal } from "../react/use-store.js";
import { RichText } from "../react/rich-text.js";
import { GoogleMark } from "../react/brand-icons.js";

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

function Account() {
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
      <div className={`account-out${inside ? " hidden" : ""}`}>
        <button
          className="google-btn"
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
        <p className="account-hint">
          <span>{t("legal.notice")}</span>
          {privacy}
        </p>

        {/* Only shown when there is something to lose. Somebody signing in on a
            fresh machine has no decision to make. */}
        {count > 0 ? (
          <>
            <label className="account-adopt">
              <input
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
            <p className="account-hint">{t("account.adoptHint")}</p>
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

      <div className={`account-in${inside ? "" : " hidden"}`}>
        <span className="account-who">{currentSession()?.email ?? ""}</span>
        <span className="account-state">{words}</span>
        {/* The notice above this lives in the signed-out block, which is
            hidden by then -- this is the only copy a signed-in person sees. */}
        {privacy}
        <button className="account-out-btn" type="button" onClick={signOut}>
          {t("account.signOut")}
        </button>
      </div>

      {/* Only shown while signed in. Two steps on purpose: the first press
          opens the explanation, the second one acts. "탈퇴" reads as
          "everything goes", so what stays has to be said before the
          irreversible button is on screen -- not in a toast afterwards. */}
      <DeleteAccount visible={inside} say={say} />

      <p
        className={`account-msg${message?.isError ? " error" : ""}`}
        role="status"
      >
        {message ? message.render() : ""}
      </p>
    </>
  );
}

/** Fill the block index.html left empty. Called once, from init(). */
export function mountAccount() {
  const host = document.getElementById("account");
  if (host) createRoot(host).render(<Account />);
}
