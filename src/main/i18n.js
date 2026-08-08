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
function initI18n(language) {
  i18next.init({
    lng: language || FALLBACK,
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

const t = (key, params) => i18next.t(key, params);

module.exports = { initI18n, setMainLanguage, t };
