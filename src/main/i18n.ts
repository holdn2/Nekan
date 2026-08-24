/**
 * Strings for the main process.
 *
 * A separate initialisation from the renderer's, not a shared one: the two run
 * in different processes and there is nothing to share but the catalogues,
 * which are JSON and read here with `require`. Main's share of the strings is
 * small -- the menu-less bits that never pass through a window.
 *
 * Kept out of `shared/core.js` deliberately. That file is loaded twice, once by
 * `require` and once as a classic script the renderer runs before its module
 * graph, so it may use neither Node nor DOM APIs -- reading a file in there
 * breaks the renderer the moment it is added.
 */

import i18next from "i18next";

import ko from "../shared/i18n/ko.json";
import en from "../shared/i18n/en.json";
import { FALLBACK } from "../shared/i18n/locales";

let ready = false;

/** Called once from main.js, after the language has been settled. */
function initI18n(lng?: string | null) {
  i18next.init({
    lng: lng || FALLBACK,
    fallbackLng: FALLBACK,
    resources: { ko: { translation: ko }, en: { translation: en } },
    interpolation: {
      escapeValue: false,
      // The same default the renderer sets, for the same seven strings. Main
      // does not draw the guide, but it reads from the same catalogues, and an
      // unresolved {{mod}} would reach a dialog title as those four braces.
      defaultVariables: { mod: process.platform === "darwin" ? "Cmd" : "Ctrl" },
    },
  });
  ready = true;
}

/**
 * Follow a language change made in the renderer.
 *
 * Main keeps its own copy because its strings are produced without a window --
 * an export written while the panel is closed still has to come out in the
 * language the user picked.
 */
function setMainLanguage(language: string) {
  if (ready) i18next.changeLanguage(language);
}

/**
 * An un-initialised i18next answers with the key itself, so a caller that ran
 * before main.js got to `initI18n` would put "export.filterPdf" in front of
 * somebody. The tests are the real case: they require shared/export.js on its
 * own, with no app around it to have set a language.
 */
function ensure() {
  if (!ready) initI18n(FALLBACK);
}

/**
 * i18next's own `t` is typed as a union -- it can answer with objects when a
 * key holds a tree, and with a details record when asked to. Nothing here does
 * either, and every caller in this process puts the answer straight into a
 * filename, a dialog title or a printed document. Saying `string` once here is
 * what keeps that from being cast at each of them.
 */
const t = (key: string, params?: Record<string, unknown>): string => (
  ensure(),
  i18next.t(key, params) as string
);

/**
 * Which language main is writing in. `shared/core.js` formats dates through
 * `Intl`, which wants the tag rather than the catalogue.
 */
function language(): string {
  ensure();
  return i18next.language;
}

export { initI18n, setMainLanguage, t, language };
