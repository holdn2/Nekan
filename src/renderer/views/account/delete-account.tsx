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
 *
 * The block is deliberately the quietest thing in the panel. It has to be
 * findable -- an account you cannot leave is the complaint it exists to answer
 * -- without sitting next to 로그아웃 as an equal choice.
 */

import { useEffect, useState } from "react";
import { messageOf } from "../../../shared/errors.js";
import { t } from "../../i18n.js";
import { RichText } from "../../react/rich-text.js";
import type { SignInResult } from "./status.js";
import {
  applySession,
  applySyncStatus,
  currentSession,
  reasonFor,
} from "./status.js";

/** The two sentences above the buttons. */
const SENTENCE = "m-[0px] mb-sm text-sm leading-normal break-keep";

/** The two buttons, minus the colours that tell them apart. */
const ACT =
  "rounded-sm border px-xl py-sm text-sm disabled:cursor-default disabled:opacity-[0.55]";

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
  //
  // Closed on either change, not only on the way out. The identity is in the
  // list below because a session can be *replaced* without passing through
  // null -- main can end one and start another between two pushes -- and a
  // body that only acted on `!visible` left the question standing in front of
  // whoever arrived.
  useEffect(() => {
    setConfirming(false);
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
    <div
      className={`account-danger mt-xl border-t border-line pt-lg${visible ? "" : " hidden"}`}
    >
      {confirming ? (
        <div className="account-confirm mt-lg rounded-md border border-danger bg-danger-soft p-xl">
          {/* Both sentences carry their own <b> through the catalogue.
              Splitting them into bold and not-bold keys would be asking a
              translator for sentence fragments, and where the emphasis falls
              moves with the language.

              break-keep is `word-break: keep-all`. The panel is narrow enough
              to split 되돌릴 수 없습니다 across two lines in the middle of the
              word -- fine for a task somebody typed, not for the one sentence
              in the app that has to be read before an irreversible button. */}
          <p className={`account-confirm-lede ${SENTENCE}`}>
            <RichText k="account.confirmLede" />
          </p>
          <p className={`account-confirm-keep ${SENTENCE} text-muted`}>
            <RichText k="account.confirmKeep" />
          </p>
          <div className="account-confirm-row mt-lg flex justify-end gap-md">
            <button
              className={`account-confirm-cancel ${ACT} border-line bg-panel text-text`}
              type="button"
              disabled={deleting}
              onClick={() => setConfirming(false)}
            >
              {t("common.cancel")}
            </button>
            {/* Not on-accent and not #fff. --danger is a deep red on the light
                theme but a light salmon on the dark one, and white on salmon is
                barely there -- measured on screen. The page background is the
                opposite of the theme's fill in both, so it is the one token
                that stays legible on this button either way. */}
            <button
              className={`account-confirm-go ${ACT} border-danger bg-danger text-bg`}
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
          className="account-leave-btn border-0 bg-transparent p-[0px] text-sm text-muted underline underline-offset-[3px] hover:text-danger"
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
