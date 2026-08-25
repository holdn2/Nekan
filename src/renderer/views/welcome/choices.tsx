/**
 * The two answers, and the one question that hangs off the first of them.
 *
 * Drawn here rather than in the card because they are the part of that markup
 * with a shape of its own: an icon, a title, a line under it, and -- for the
 * recommended one -- a badge that has to be markup rather than a CSS `content`
 * string, or it is a word on screen no catalogue can reach.
 *
 * Nothing is decided here. Whether the local tasks are merged into the account
 * belongs to the card, which owns the checkbox's answer and hands both choices
 * back as callbacks.
 */

import { t } from "../../i18n.js";
import { cn } from "../../react/cn.js";
import { RichText } from "../../react/rich-text.js";
import { GoogleMark, LaptopIcon } from "../../react/brand-icons.js";

/**
 * Both answers, minus the border colour that tells them apart.
 *
 * No `hover:border-muted` in here, and that is the transcription rather than a
 * decision: welcome.css had `.welcome-choice:hover` and then
 * `.welcome-choice.recommended` below it, same specificity, later wins -- so
 * the recommended one has never lit up on hover. Measured before the move, by
 * forcing :hover through CDP and reading the border colour: it did not change.
 * Putting the hover on the shared constant would make it start, which is a
 * change to the screen and this is not the issue for it.
 */
const TEXT = "welcome-choice-text flex flex-col gap-hair";

/** The line under a choice's title. <small> comes out of the UA smaller. */
const SUB = "text-xs text-muted";

const CHOICE = cn(
  "welcome-choice mb-md flex w-full items-center gap-xl rounded-panel border",
  "bg-panel px-2xl py-xl text-left text-text",
  "disabled:cursor-default disabled:opacity-[0.55]",
);

interface Props {
  /** A choice is in flight; both buttons are dead until it lands. */
  busy: boolean;
  /** How many tasks this computer already has. Zero hides the question. */
  count: number;
  adopt: boolean;
  onAdopt: (next: boolean) => void;
  onSync: () => void;
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
      {/* Emphasis without a fill. `.primary` was the obvious class name and
          the wrong one twice over: memo.css owns it and would have painted
          this in the app's accent, and Google asks that its button keep neutral
          chrome so the wordmark colours stay the only colour on it. */}
      <button
        className={cn(CHOICE, "recommended border-line-strong shadow-knob")}
        type="button"
        disabled={busy}
        onClick={onSync}
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
      </button>

      <button
        className={cn(CHOICE, "border-line hover:border-muted")}
        type="button"
        disabled={busy}
        onClick={onLocal}
      >
        <LaptopIcon />
        <span className={TEXT}>
          <b className="text-md font-semibold">{t("welcome.localTitle")}</b>
          <small className={SUB}>{t("welcome.localSub")}</small>
        </span>
      </button>

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
