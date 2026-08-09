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
 * The inline emphasis a catalogue string is allowed to carry.
 *
 * Some sentences have a bold clause in the middle of them ("계정과 <b>서버에
 * 있는 사본</b>을 지웁니다"), and where that clause falls moves with the
 * language -- so it cannot be split into "before" and "after" keys without
 * translating a sentence fragment. The whole sentence stays one string and the
 * markup travels with it.
 *
 * Three tags, and only three. Anything else in a catalogue value stays text,
 * which is the point: this parses rather than assigns to innerHTML, so a string
 * can never introduce an element or an attribute that is not on this list.
 */
const INLINE = /<(b|em|code)>([\s\S]*?)<\/\1>/g;

/** A translated string as DOM nodes, with its <b> / <em> / <code> made real. */
export function tNodes(key, params) {
  const text = t(key, params);
  const out = [];
  let at = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > at) {
      out.push(document.createTextNode(text.slice(at, match.index)));
    }
    const el = document.createElement(match[1]);
    el.textContent = match[2];
    out.push(el);
    at = match.index + match[0].length;
  }
  if (at < text.length) out.push(document.createTextNode(text.slice(at)));
  return out;
}

/**
 * Fill in everything the static markup declares.
 *
 * `data-i18n` sets the content; `data-i18n-attr` is a comma-separated list of
 * attributes to set alongside it. An entry is either `title` (same key as the
 * content) or `title=some.other.key` -- a chip that says one thing and explains
 * itself in another needs two strings, and hanging the second one off a wrapper
 * element instead would put markup in the way of the stylesheet.
 *
 * Most of index.html's Korean is in `title` and `aria-label`, which never show
 * on screen -- reviewing by eye leaves them behind, so they get the same pass
 * as the visible text.
 */
export function applyStaticStrings(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    const attrs = el.dataset.i18nAttr;
    if (attrs) {
      attrs.split(",").forEach((entry) => {
        const [name, alt] = entry.split("=");
        el.setAttribute(name.trim(), t((alt || key).trim()));
      });
    }
    // An element may translate only its attributes -- an icon button with a
    // title and no text of its own. Writing an empty string into those would
    // erase the icon markup inside them.
    if (!el.hasAttribute("data-i18n-attr-only"))
      el.replaceChildren(...tNodes(key));
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
