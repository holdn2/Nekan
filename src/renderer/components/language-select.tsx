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
 *
 * The look is here rather than at the two call sites, and that settles an
 * ordering the stylesheets used to carry: `.settings-select` was defined in
 * settings.css and welcome.css was loaded straight after it so the first-run
 * card could paint over the picker. Nothing overpaints anything now -- the card
 * adds where the picker sits and this decides what it looks like -- so that
 * one line of cascade is gone rather than moved.
 */

import { t, currentLanguage, setLanguage } from "../i18n.js";
import { cn } from "../react/cn.js";
import { useRenderSignal } from "../react/use-store.js";

interface Props {
  id: string;
  /** Where it sits, when a caller has an opinion. The look is not a caller's. */
  className?: string;
  /** Only where there is no <label> pointing at it -- see the settings row. */
  ariaLabel?: string;
}

export function LanguageSelect({ id, className, ariaLabel }: Props) {
  useRenderSignal();

  return (
    <select
      id={id}
      // Shaped like the export button beside it so the row reads as one kind of
      // control, but a real <select>: the list grows with every language and
      // the OS knows how to present a long one better than anything drawn here
      // would. font-[inherit] is the family only -- a <select> comes out of the
      // UA stylesheet in the system UI face, and the size is asked for by name.
      className={cn(
        "cursor-pointer rounded-md border border-line bg-transparent",
        "px-lg py-xs font-[inherit] text-sm text-text hover:border-muted",
        className,
      )}
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
        // The popup is drawn by the OS, which does not inherit the transparent
        // background above -- on the dark theme that left dark text on dark.
        <option key={code} className="bg-panel text-text" value={code}>
          {t(`language.${code}`)}
        </option>
      ))}
    </select>
  );
}
