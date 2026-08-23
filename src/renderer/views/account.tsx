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
import type { PublicSession } from "../../shared/types.js";
import { messageOf } from "../../shared/errors.js";
import { t } from "../i18n.js";
import { activeCount } from "../store.js";
import { notify } from "../render-bus.js";
import { toast } from "../components/toast.js";
import { useRenderSignal } from "../react/use-store.js";
import { RichText } from "../react/rich-text.js";
import { GoogleMark } from "../react/brand-icons.js";

/** What a sign-in answers with: the session when it worked, a code when not. */
interface SignInResult {
  ok?: boolean;
  error?: string;
  session?: PublicSession | null;
  /** Whether the delete also ended the session it was for. */
  signedOut?: boolean;
}

/** What main reports on the sync channel. `pending` is worked out from it. */
interface SyncStatus {
  state: string;
  unsent: number;
  session?: PublicSession | null;
}

/**
 * What main has told us, kept outside the component.
 *
 * These arrive as pushes rather than as anything the panel asked for, and they
 * can land before it is on screen -- the settings popover is closed most of the
 * time. Holding them here and announcing means the panel is right whenever it
 * does open, and the same values survive a language change.
 */
let session: PublicSession | null = null;
let status: SyncStatus | null = null;
/** Whether this build has the development password channel at all. */
let devLogin = false;

/** Show the signed-in half or the signed-out half. */
export function applySession(next: PublicSession | null) {
  session = next;
  notify();
}

/** The words in the panel, and the dot on the gear. */
export function applySyncStatus(next: SyncStatus | null) {
  status = next;
  notify();
}

/** Called once from init, before the first applySession. */
export function setDevLogin(enabled: unknown) {
  devLogin = Boolean(enabled);
  notify();
}

/**
 * An edit that had not been sent yet lost to another device's version.
 *
 * Said out loud, unlike a network failure. `실패는 조용히` is about things the
 * user cannot act on; this is the one sync outcome where something they wrote
 * is gone and they may want to write it again.
 */
export function announceOverwritten(count: number) {
  if (!count) return;
  toast(t("account.overwritten", { count }), { ms: 8000 });
}

/** Failure codes worth naming. Anything else is shown as itself. */
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
  no_session: "account.error.noSession",
};

/** A failure code as a sentence. An unknown one is shown as itself — a code on
 *  screen is something a user can quote and I can search for. */
function reasonFor(code: string, fallbackKey: string) {
  if (code in REASONS) return REASONS[code] ? t(REASONS[code]) : "";
  return t(fallbackKey, { code });
}

/** What the four states are called, in the settings panel. */
const LABELS: Record<string, string | null> = {
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
function displayState(from: SyncStatus | null): string {
  if (!from || from.state === "off") return "off";
  if (from.state === "synced" && from.unsent > 0) return "pending";
  return from.state;
}

/**
 * A message the panel is showing, as a function rather than a string.
 *
 * The language picker is in this very panel, so a sign-in result can be on
 * screen when the language changes. A thunk carries the interpolated bits (an
 * email, an error code) along without this file having to store them.
 */
type Message = { render: () => string; isError: boolean } | null;

function Account() {
  useRenderSignal();
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [adopt, setAdopt] = useState(true);
  const [dev, setDev] = useState({ email: "", password: "" });

  const inside = Boolean(session?.email);
  const state = displayState(status);
  const label = LABELS[state];
  // `count` rather than the old %n placeholder: it is the name i18next reserves
  // for the number a sentence is about, so a language that needs a plural form
  // can grow one in the catalogue without this line changing.
  const words = label ? t(label, { count: status?.unsent ?? 0 }) : "";

  // The gear is in the title bar, outside anything this panel draws. Only
  // `pending` and `offline` colour its dot; settings.css hides it for the rest,
  // because a widget that is fine should not be asking for attention.
  useEffect(() => {
    const gear = document.getElementById("settingsBtn");
    if (!gear) return;
    gear.dataset.sync = state;
    gear.title =
      state === "offline"
        ? t("account.gearOffline")
        : words
          ? t("account.gearState", { state: words })
          : t("settings.title");
  });

  // Signing out and straight back in as somebody else would otherwise hand the
  // new account an open "계정 삭제" that nobody there asked for.
  useEffect(() => {
    if (!inside) setConfirming(false);
  }, [inside, session?.userId]);

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
      // not registered at all -- devLogin in a packaged build -- or when the
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

  const deleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    say(() => t("account.deleting"));
    try {
      // Unlike logout, this one is the server's to do, so a failure means the
      // account is still there. Saying nothing would leave a panel that looks
      // signed in with no explanation of what happened.
      const result = await window.api
        .deleteAccount()
        .catch((err: unknown): SignInResult => ({
          ok: false,
          error: messageOf(err),
        }));
      if (!result?.ok) {
        const code = result?.error || "unknown";
        say(() => reasonFor(code, "account.deleteFailed"), true);
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
      setDeleting(false);
    }
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
            channel -- see main/ipc.ts. */}
        {devLogin && !inside ? (
          <form
            className="account-dev"
            onSubmit={(e) => {
              e.preventDefault();
              finish(window.api.devLogin(dev.email, dev.password, adoptMode()));
            }}
          >
            <input
              id="devEmail"
              type="email"
              value={dev.email}
              onChange={(e) => setDev({ ...dev, email: e.target.value })}
              placeholder={t("account.devEmail")}
              autoComplete="off"
            />
            <input
              id="devPassword"
              type="password"
              value={dev.password}
              onChange={(e) => setDev({ ...dev, password: e.target.value })}
              placeholder={t("account.devPassword")}
              autoComplete="off"
            />
            <button type="submit">{t("account.devSignIn")}</button>
          </form>
        ) : null}
      </div>

      <div className={`account-in${inside ? "" : " hidden"}`}>
        <span className="account-who">{session?.email ?? ""}</span>
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
      <div className={`account-danger${inside ? "" : " hidden"}`}>
        {confirming ? (
          <div className="account-confirm">
            {/* Both sentences carry their own <b> through the catalogue.
                Splitting them into bold and not-bold keys would be asking a
                translator for sentence fragments, and where the emphasis falls
                moves with the language. */}
            <p className="account-confirm-lede">
              <RichText k="account.confirmLede" />
            </p>
            <p className="account-confirm-keep">
              <RichText k="account.confirmKeep" />
            </p>
            <div className="account-confirm-row">
              <button
                className="account-confirm-cancel"
                type="button"
                disabled={deleting}
                onClick={() => setConfirming(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                className="account-confirm-go"
                type="button"
                disabled={deleting}
                onClick={deleteAccount}
              >
                {t("account.confirmGo")}
              </button>
            </div>
          </div>
        ) : (
          <button
            className="account-leave-btn"
            type="button"
            onClick={() => {
              setConfirming(true);
              say(null);
            }}
          >
            {t("account.leave")}
          </button>
        )}
      </div>

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
