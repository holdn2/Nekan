/**
 * The phone's half of the catalogue.
 *
 * Same shape as the renderer's: i18next initialised with both catalogues
 * already in hand, English as the fallback, and one `t` that every string on
 * screen goes through. There are three i18next initialisations now -- main,
 * renderer, and this -- because the processes cannot share one instance; what
 * they share is `src/shared/i18n/`, and that is the part that must not drift.
 *
 * The language starts as the device's and can then be chosen. The device is
 * the fallback rather than the rule, because "follow the system" has to go on
 * meaning that after the system changes its mind. It is per-device -- it does
 * not travel over sync, the same as on the desktop.
 *
 * This file cannot read the store at import time: the store loads from disk
 * and that is async, while the first screen renders before it finishes. So the
 * device decides the first paint and `applyLanguage` corrects it once the file
 * is in -- which is the same shape as the desktop's problem, solved there by
 * handing the language to the window before it opens.
 */
import i18next from "i18next";
import { getLocales } from "expo-localization";
import ko from "@nekan/shared/i18n/ko.json";
import en from "@nekan/shared/i18n/en.json";
import { pickLanguage } from "@nekan/shared/i18n/locales";

i18next.init({
  lng: pickLanguage(getLocales()[0]?.languageTag),
  // A key missing from one catalogue falls back rather than rendering its own
  // name at the user -- `settings.theme` on screen is a bug report.
  fallbackLng: "en",
  resources: { ko: { translation: ko }, en: { translation: en } },
  interpolation: {
    escapeValue: false,
    // The guide's strings name a modifier key, and a phone has none. These
    // stand in so nothing renders a raw `{{mods}}` before the guide screen
    // exists; that screen will need its own wording anyway, because the
    // gestures it describes are not the desktop's.
    defaultVariables: { mod: "Ctrl", mods: "Ctrl / Cmd" },
  },
});

/**
 * The one way a string reaches the screen.
 *
 * Typed as `string` because i18next's own type is a union that can answer with
 * an object when a key holds a tree, and no caller wants that.
 */
export const t = (key: string, vars?: Record<string, unknown>): string =>
  i18next.t(key, vars ?? {}) as string;

/**
 * The tag `Intl` wants, for the few places a date is formatted rather than
 * translated. Read from i18next rather than kept alongside it, so there is one
 * answer to "what language is this" and not two that can disagree.
 */
export const locale = (): string => i18next.language || "en";

/**
 * Switch, or go back to following the device.
 *
 * Returns whether anything changed, so the caller can decide to redraw. It
 * does not redraw by itself: i18next is not the store, and a screen that
 * re-renders for a language is one that was already listening for a task.
 */
export function applyLanguage(choice: string | null): boolean {
  const next = choice ?? pickLanguage(getLocales()[0]?.languageTag);
  if (next === i18next.language) return false;
  void i18next.changeLanguage(next);
  return true;
}

/**
 * The same string with its emphasis removed.
 *
 * A handful of catalogue entries carry `<b>`, `<em>` or `<code>`; the renderer
 * parses those into nodes. Nothing here does, and a phone screen showing a
 * literal `<b>` is worse than one that has lost a bold word -- so the guide,
 * which is where those entries live, asks for the words without them. When
 * this app grows a rich-text component the parsing belongs there, not here.
 */
export const plain = (key: string, vars?: Record<string, unknown>): string =>
  t(key, vars).replace(new RegExp("</?(b|em|code)>", "g"), "");

/** What the device would say, for the "system" option to name it. */
export const deviceLanguage = (): string =>
  pickLanguage(getLocales()[0]?.languageTag);
