/**
 * The phone's half of the catalogue.
 *
 * Same shape as the renderer's: i18next initialised with both catalogues
 * already in hand, English as the fallback, and one `t` that every string on
 * screen goes through. There are three i18next initialisations now -- main,
 * renderer, and this -- because the processes cannot share one instance; what
 * they share is `src/shared/i18n/`, and that is the part that must not drift.
 *
 * The language is read from the device rather than stored, for now. A picker
 * belongs with the settings screen, and `settings.language` is per-device on
 * the desktop too -- it does not arrive over sync, so nothing is lost by
 * deciding it here until that screen exists.
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
