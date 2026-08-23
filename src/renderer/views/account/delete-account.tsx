/**
 * Deleting the account, in two steps.
 *
 * Two because the first press is not the decision -- it opens a sentence
 * saying what will happen and what will not. The tasks on this computer stay:
 * they were the user's before there was an account to put them in, and the
 * panel says so before the second button is pressed.
 *
 * The message line belongs to the panel, so `say` comes in as a prop. The
 * open/closed state does not: nobody outside needs it, and closing it when the
 * account changes is this component's own business.
 */

import { useEffect, useState } from "react";
import { messageOf } from "../../../shared/errors.js";
import { t } from "../../i18n.js";
import { RichText } from "../../react/rich-text.js";
import type { Message, SignInResult } from "./status.js";
import {
  applySession,
  applySyncStatus,
  currentSession,
  reasonFor,
} from "./status.js";

interface Props {
  /** Signed in. The block is in the markup either way, hidden when not. */
  visible: boolean;
  /** The panel's message line. Null clears it. */
  say: (render: (() => string) | null, isError?: boolean) => void;
}

export function DeleteAccount({ visible, say }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Signing out and straight back in as somebody else would otherwise hand the
  // new account an open "계정 삭제" that nobody there asked for.
  useEffect(() => {
    if (!visible) setConfirming(false);
  }, [visible, currentSession()?.userId]);

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

  return (
    <div className={`account-danger${visible ? "" : " hidden"}`}>
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
  );
}
