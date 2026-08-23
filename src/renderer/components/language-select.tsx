/**
 * The language picker, on both screens that offer one.
 *
 * Two of them exist because the settings panel is behind the gear and the gear
 * is behind the first-run card, which covers the whole window. Somebody whose
 * computer opened the app in a language they cannot read would otherwise have
 * to answer where their tasks live before they could ask for words they
 * understand.
 *
 * Both read the same answer rather than being kept in step. There used to be a
 * Set of every <select> on screen and a loop that wrote the new value into each
 * of them on a switch -- one more thing to remember, and this component is the
 * whole of what replaced it: setLanguage() rings the render bus, both pickers
 * re-read currentLanguage(), and a third one added tomorrow needs no wiring.
 *
 * The options come from preload, so adding a language means adding a catalogue
 * and nothing else. Each is named in its own language: a person looking for
 * theirs is looking for a word they recognise, not for its name written in a
 * script they cannot read -- which is exactly the state they are in here.
 */

import { t, currentLanguage, setLanguage } from "../i18n.js";
import { useRenderSignal } from "../react/use-store.js";

interface Props {
  id: string;
  className: string;
  /** Only where there is no <label> pointing at it -- see the settings row. */
  ariaLabel?: string;
}

export function LanguageSelect({ id, className, ariaLabel }: Props) {
  useRenderSignal();

  return (
    <select
      id={id}
      className={className}
      aria-label={ariaLabel}
      value={currentLanguage()}
      onChange={(e) => {
        setLanguage(e.target.value);
        // Main keeps its own i18next and writes the choice to settings, so the
        // next launch paints in this language before the window exists.
        window.api.setLanguage(e.target.value);
      }}
    >
      {(window.api.languages || []).map((code) => (
        <option key={code} value={code}>
          {t(`language.${code}`)}
        </option>
      ))}
    </select>
  );
}
