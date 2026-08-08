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

const i18next = require("i18next");

const ko = require("../shared/i18n/ko.json");
const en = require("../shared/i18n/en.json");
const { FALLBACK } = require("../shared/i18n/locales");

let ready = false;

/** Called once from main.js, after the language has been settled. */
function initI18n(lng) {
  i18next.init({
    lng: lng || FALLBACK,
    fallbackLng: FALLBACK,
    resources: { ko: { translation: ko }, en: { translation: en } },
    interpolation: { escapeValue: false },
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
function setMainLanguage(language) {
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

const t = (key, params) => {
  ensure();
  return i18next.t(key, params);
};

/**
 * Which language main is writing in. `shared/core.js` formats dates through
 * `Intl`, which wants the tag rather than the catalogue.
 */
function language() {
  ensure();
  return i18next.language;
}

module.exports = { initI18n, setMainLanguage, t, language };
