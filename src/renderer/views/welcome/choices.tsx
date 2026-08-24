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
import { RichText } from "../../react/rich-text.js";
import { GoogleMark, LaptopIcon } from "../../react/brand-icons.js";

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
      <button
        className="welcome-choice recommended"
        type="button"
        disabled={busy}
        onClick={onSync}
      >
        <GoogleMark />
        <span className="welcome-choice-text">
          <b>
            <span>{t("welcome.syncTitle")}</span>
            {/* Markup rather than a CSS `content` string. It used to be one,
                  which put a word on screen that no catalogue could reach and
                  that the untranslated sweep could not see. */}
            <span className="welcome-badge">{t("welcome.recommended")}</span>
          </b>
          <small>{t("welcome.syncSub")}</small>
        </span>
      </button>

      <button
        className="welcome-choice"
        type="button"
        disabled={busy}
        onClick={onLocal}
      >
        <LaptopIcon />
        <span className="welcome-choice-text">
          <b>{t("welcome.localTitle")}</b>
          <small>{t("welcome.localSub")}</small>
        </span>
      </button>

      {/* Only when there is something to carry. A fresh install has nothing
            to decide and should not be handed a decision. */}
      {count > 0 ? (
        <label className="welcome-adopt">
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
