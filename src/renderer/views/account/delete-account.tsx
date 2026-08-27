/**
 * Deleting the account, in two steps.
 *
 * Two because the first press is not the decision -- it opens a sentence
 * saying what will happen and what will not. The tasks on this computer stay:
 * they were the user's before there was an account to put them in, and the
 * dialog says so before the second button is pressed.
 *
 * The second step is a ui/alert-dialog now, not a red box grown inside the
 * settings panel. Three things come with that and none of them could be had
 * from a panel that was 320px wide and scrolled:
 *
 *   - Focus goes into the dialog and cannot leave it while it is up. The
 *     inline box left the tab order running on through the rest of the panel,
 *     so the key after "계정 삭제" was whatever happened to be next in the
 *     settings sheet.
 *   - `role="alertdialog"` with the title and the sentences named as its
 *     label and description, which is what a screen reader needs to read the
 *     warning before the buttons rather than after them.
 *   - A click outside cannot dismiss it. Radix's AlertDialogContent prevents
 *     that on purpose, which is the difference between an alert dialog and a
 *     popover, and it is the right difference for the one irreversible button
 *     in the app.
 *
 * Escape still closes it -- that is Radix's, untouched, and it is the same
 * key the settings panel binds on the document. Both fire; the panel closing
 * under a dismissed confirmation is not a state anybody can act on wrongly.
 *
 * The message line belongs to the panel, so `say` comes in as a prop. The
 * open/closed state does not: nobody outside needs it, and closing it when the
 * account changes is this component's own business.
 *
 * The trigger stays deliberately the quietest thing in the panel. It has to be
 * findable -- an account you cannot leave is the complaint it exists to answer
 * -- without sitting next to 로그아웃 as an equal choice.
 */

import { useEffect, useState } from "react";
import { messageOf } from "../../../shared/errors.js";
import { t } from "../../i18n.js";
import { RichText } from "../../react/rich-text.js";
import { Button } from "../../components/ui/button.js";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog.js";
import type { SignInResult } from "./status.js";
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
      {/* Controlled rather than driven by AlertDialogTrigger: the effect above
          has to be able to close it when the session changes underneath, and a
          trigger owns nothing this component can reach. */}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <Button
          className="account-leave-btn p-[0px] text-sm text-muted underline underline-offset-[3px] hover:bg-transparent hover:text-danger"
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => {
            setConfirming(true);
            say(null);
          }}
        >
          {t("account.leave")}
        </Button>

        {/* `sm` is the two-column footer: cancel on the left, the irreversible
            one on the right, both the same width. The default size lays the
            footer out with `sm:flex-row`, and screen variants do not compile
            in this app at all -- it would come out as a reversed column. */}
        <AlertDialogContent className="account-confirm" size="sm">
          <AlertDialogHeader className="place-items-start text-left">
            <AlertDialogTitle>{t("account.leave")}</AlertDialogTitle>
            {/* Both sentences carry their own <b> through the catalogue.
                Splitting them into bold and not-bold keys would be asking a
                translator for sentence fragments, and where the emphasis falls
                moves with the language.

                One Description holding two blocks rather than two elements:
                Radix names exactly one node as the dialog's description, and a
                second paragraph outside it is a sentence a screen reader never
                reads. <span class="block"> rather than <p>, because a <p>
                cannot contain a <p>.

                break-keep is `word-break: keep-all`. The dialog is narrow
                enough to split 되돌릴 수 없습니다 across two lines in the
                middle of the word -- fine for a task somebody typed, not for
                the one sentence in the app that has to be read before an
                irreversible button. */}
            <AlertDialogDescription className="text-left break-keep">
              <span className="account-confirm-lede block text-text">
                <RichText k="account.confirmLede" />
              </span>
              <span className="account-confirm-keep mt-sm block">
                <RichText k="account.confirmKeep" />
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="account-confirm-cancel"
              disabled={deleting}
            >
              {t("common.cancel")}
            </AlertDialogCancel>
            {/* ui/button's `destructive` variant, which is danger-on-a-tint
                rather than the solid `bg-danger text-bg` this used to paint by
                hand. That pairing existed because white on the dark theme's
                salmon --danger was barely there; a tint has no such problem,
                the text being --danger itself. */}
            <AlertDialogAction
              className="account-confirm-go"
              variant="destructive"
              disabled={deleting}
              onClick={deleteAccount}
            >
              {t("account.confirmGo")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
