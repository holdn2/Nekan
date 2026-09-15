/**
 * The answers, and the one question that hangs off the sign-ins.
 *
 * Drawn here rather than in the card because they are the part of that markup
 * with a shape of its own: an icon, a title, a line under it, and -- for the
 * recommended one -- a badge that has to be markup rather than a CSS `content`
 * string, or it is a word on screen no catalogue can reach.
 *
 * Nothing is decided here. Whether the local tasks are merged into the account
 * belongs to the card, which owns the checkbox's answer and hands the choices
 * back as callbacks.
 */

import { t } from "../../i18n.js";
import { cn } from "../../react/cn.js";
import { RichText } from "../../react/rich-text.js";
import { AppleMark, GoogleMark, LaptopIcon } from "../../react/brand-icons.js";
import { Button } from "../../components/ui/button.js";

const TEXT = "welcome-choice-text flex flex-col gap-hair";

/** The line under a choice's title. <small> comes out of the UA smaller. */
const SUB = "text-xs text-muted";

/**
 * Every answer, drawn exactly alike.
 *
 * ui/button's `outline` variant is the base -- neutral chrome, a `line`
 * hairline, `panel-2` on hover -- and everything here is undoing the fact that
 * ui/button is built for a label on one line:
 *
 *   h-auto           the sizes are all fixed heights; these are two lines
 *                    of text tall.
 *   w-full           a button shrinks to its label; these fill the card.
 *   justify-start    ui/button centres, and these read as rows.
 *   whitespace-normal  ui/button is `whitespace-nowrap`, and the line under
 *                    each title has to be allowed to wrap.
 *
 * They now light up on hover, which they did not before, and that is worth
 * saying because it is a change to the screen rather than a transcription:
 * welcome.css had `.welcome-choice:hover` and then `.welcome-choice.recommended`
 * below it at the same specificity, so the recommended one had never lit up.
 * Measured before the move by forcing :hover through CDP -- the border did not
 * change. Both do now, and they do it the same way.
 *
 * `panel-2` and never the accent: the recommended answer carries the Google
 * mark, and Google asks that a button offering its sign-in keep neutral chrome
 * so the wordmark is the only colour on it.
 */
const CHOICE = cn(
  // rounded-lg, which is the card's own 12px rather than the 10px these had.
  // One radius on the screen was asked for, and two nested roundings a couple
  // of pixels apart is the kind of difference that reads as a mistake rather
  // than as a decision.
  "welcome-choice mb-md h-auto w-full justify-start gap-xl rounded-lg",
  "px-2xl py-xl text-left whitespace-normal text-text",
);

interface Props {
  /** A choice is in flight; every button is dead until it lands. */
  busy: boolean;
  /** How many tasks this computer already has. Zero hides the question. */
  count: number;
  adopt: boolean;
  onAdopt: (next: boolean) => void;
  onSync: (provider: "google" | "apple") => void;
  onLocal: () => void;
}

export function WelcomeChoices({
  busy,
  count,
  adopt,
  onAdopt,
  onSync,
  onLocal,
}: Props) {
  return (
    <>
      {/* Emphasis without a fill, and now without a border of its own either.
          `variant="default"` is the obvious choice and the wrong one for the
          same reason `.primary` was: it paints in the app's accent, and Google
          asks that a button offering its sign-in keep neutral chrome so the
          wordmark colours stay the only colour on it.

          This used to carry a stronger hairline and a shadow to say "this
          one". Both are gone: the answers are the same shape now, and the
          badge is what marks the recommendation. A single button drawn with a
          heavier edge than the ones under it reads as them being different
          kinds of thing rather than as one being suggested. */}
      <Button
        className={cn(CHOICE, "recommended")}
        variant="outline"
        type="button"
        disabled={busy}
        onClick={() => onSync("google")}
      >
        <GoogleMark />
        <span className={TEXT}>
          <b className="text-md font-semibold">
            <span>{t("welcome.syncTitle")}</span>
            {/* Markup rather than a CSS `content` string. It used to be one,
                  which put a word on screen that no catalogue could reach and
                  that the untranslated sweep could not see. */}
            <span
              className={cn(
                "welcome-badge ml-sm rounded-pill bg-accent-soft px-sm py-hair",
                "align-[1px] text-xs font-medium text-accent",
              )}
            >
              {t("welcome.recommended")}
            </span>
          </b>
          <small className={SUB}>{t("welcome.syncSub")}</small>
        </span>
      </Button>

      {/* Not recommended, and its line says who it is for instead of
          repeating what syncing is. Apple and Google are separate accounts
          unless the email matches, so the useful thing to say is which one an
          iPhone already signed into -- picking the other gives an empty list
          that looks like a sync that did not work.

          Its logo takes the words' colour, which is `text`, not pure black.
          This is a row among the app's own answers rather than Apple's button,
          and Apple's rule for a custom button is that the logo and the title
          are one colour -- which holds in both themes. The settings panel,
          where it is a stand-alone sign-in button, uses Apple's white one.

          The title is Apple's own wording and not "… and sync" like the row
          above: a custom Sign in with Apple button may only say "Sign in with
          Apple", "Sign up with Apple" or "Continue with Apple". The line under
          it does the rest. Same key as the settings button, so the two cannot
          drift. */}
      <Button
        className={CHOICE}
        variant="outline"
        type="button"
        disabled={busy}
        onClick={() => onSync("apple")}
      >
        <AppleMark />
        <span className={TEXT}>
          <b className="text-md font-semibold">{t("account.apple")}</b>
          <small className={SUB}>{t("welcome.syncAppleSub")}</small>
        </span>
      </Button>

      <Button
        className={CHOICE}
        variant="outline"
        type="button"
        disabled={busy}
        onClick={onLocal}
      >
        <LaptopIcon />
        <span className={TEXT}>
          <b className="text-md font-semibold">{t("welcome.localTitle")}</b>
          <small className={SUB}>{t("welcome.localSub")}</small>
        </span>
      </Button>

      {/* Only when there is something to carry. A fresh install has nothing
            to decide and should not be handed a decision. */}
      {count > 0 ? (
        <label className="welcome-adopt mt-xl flex cursor-pointer items-center justify-center gap-sm text-sm text-muted">
          <input
            type="checkbox"
            checked={adopt}
            onChange={(e) => onAdopt(e.target.checked)}
          />
          {/* Written whole rather than as a number dropped into fixed markup
                — where the count falls in the sentence moves with the
                language. */}
          <span>
            <RichText k="welcome.adopt" params={{ count }} />
          </span>
        </label>
      ) : null}
    </>
  );
}
