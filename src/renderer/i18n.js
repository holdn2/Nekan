/**
 * Strings for the renderer.
 *
 * Both catalogues are imported, not fetched: the language has to be settled
 * before the first paint and a fetch would not be. `state:load` is no good for
 * the same reason -- it is an IPC round trip, so it lands after the window has
 * already painted. That is the trap the saved theme fell into, where the switch
 * pill visibly slid across on every launch; a language arriving late would show
 * one language for a frame and then swap, which nothing can hide. So main
 * settles it before the window exists and hands it over on the command line,
 * and preload reads it out of argv synchronously.
 *
 * i18next is initialised with the catalogues already in hand for the same
 * reason -- a backend plugin would make this asynchronous again.
 *
 * The import path reaches out of src/ into node_modules. That was checked
 * inside a packaged asar rather than assumed: `npm start` proves nothing here
 * because node_modules is sitting right there either way.
 */

import i18next from "../../node_modules/i18next/dist/esm/i18next.js";
import ko from "../shared/i18n/ko.json" with { type: "json" };
import en from "../shared/i18n/en.json" with { type: "json" };
import { notify } from "./render-bus.js";

/** What preload read out of argv, or the fallback if it somehow was not there. */
const startupLanguage = (window.api && window.api.language) || "en";

i18next.init({
  lng: startupLanguage,
  // A key missing from one catalogue falls back rather than rendering its own
  // name at the user. Untranslated English in a Korean window is a blemish;
  // `settings.theme` on screen is a bug report.
  fallbackLng: "en",
  resources: { ko: { translation: ko }, en: { translation: en } },
  interpolation: { escapeValue: false },
});

/** The one way a string reaches the screen. */
export const t = (key, params) => i18next.t(key, params);

/** Which language is on screen right now. */
export const currentLanguage = () => i18next.language;

/**
 * Fill in everything the static markup declares.
 *
 * `data-i18n` sets the text; `data-i18n-attr` is a comma-separated list of
 * attributes to set from the same key. Most of index.html's Korean is in
 * `title` and `aria-label`, which never show on screen -- reviewing by eye
 * leaves them behind, so they get the same pass as the visible text.
 */
export function applyStaticStrings(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    const attrs = el.dataset.i18nAttr;
    if (attrs) {
      attrs.split(",").forEach((name) => el.setAttribute(name.trim(), t(key)));
    }
    // An element may translate only its attributes -- an icon button with a
    // title and no text of its own. Writing an empty string into those would
    // erase the icon markup inside them.
    if (!el.hasAttribute("data-i18n-attr-only")) el.textContent = t(key);
  });
}

/**
 * Switch language without a restart.
 *
 * The argv hand-off is only about the first paint; after that i18next can swap
 * catalogues in place. Everything drawn from `t()` comes back through the
 * normal redraw, and the static markup is re-applied here because nothing else
 * ever touches it again.
 */
export function setLanguage(next) {
  if (next === i18next.language) return;
  i18next.changeLanguage(next);
  document.documentElement.lang = next;
  applyStaticStrings();
  notify();
}
