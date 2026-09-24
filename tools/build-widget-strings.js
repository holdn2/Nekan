/**
 * Turn the shared catalogue into the string catalogue the iOS widget reads.
 *
 * The widget is a native target. It cannot reach `src/shared/i18n/*.json` --
 * there is no JavaScript in it at all -- and Xcode will not read JSON in that
 * shape anyway. So the words have to exist twice, in two formats, and the only
 * question is whether the second copy is written by hand or generated. Written
 * by hand it drifts the first time somebody rewords a button, and nothing
 * catches it: `tools/find-untranslated.js` looks at .js, .ts, .html and .css,
 * so a Swift string is invisible to every check this repository has.
 *
 * The output is committed, for the same reason the palette is: the repository
 * should be readable without running a build, and a diff should show the words
 * changing rather than a build step changing. `tools/test/` asserts the
 * committed copy is what this would write.
 *
 * **The mic's label is not a new string.** It is `speech.start`, the same words
 * the in-app microphone uses, because they are the same act. Giving the widget
 * its own copy is how the glossary gets quietly overruled.
 *
 * The widget follows the app's language, not the phone's (since 2026-09-24).
 * Xcode compiles this catalogue into one .lproj per language, and `appText` in
 * BoardWidget.swift opens the folder for the language the app wrote into the
 * shared container. Until then this was listed here as a limitation: a phone
 * in English with Nekan set to Korean showed an English widget. It became
 * cheap to fix when the board widget needed that container anyway.
 *
 * What still follows the system: the gallery's description, and the line
 * asking to open the app once. Both are shown before the app has ever written
 * a language, so there is nothing else to follow.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TARGET = path.join(
  ROOT,
  "apps",
  "mobile",
  "targets",
  "quick",
  "Localizable.xcstrings",
);

/** Source language of the catalogue Xcode generates from. */
const SOURCE = "en";

/** The languages the app ships, in the order `src/shared/i18n/` has them. */
const LANGS = ["en", "ko"];

/**
 * Swift key -> catalogue key.
 *
 * Swift asks for these by string, so this map is the whole contract between
 * the two files. A key here that the Swift never uses is dead weight; a key
 * the Swift uses that is not here renders as the key itself, visibly.
 */
const KEYS = {
  "widget.description": "widget.description",
  // Deliberately the in-app microphone's words. See the header.
  "widget.speak": "speech.start",
  "widget.write": "widget.write",
  "widget.boardDescription": "widget.boardDescription",
  "widget.openApp": "widget.openApp",
};

function catalogue(lang) {
  const file = path.join(ROOT, "src", "shared", "i18n", `${lang}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** Read a dotted path, throwing rather than writing `undefined` into Xcode. */
function lookup(tree, key, lang) {
  const value = key
    .split(".")
    .reduce((node, part) => (node == null ? node : node[part]), tree);
  if (typeof value !== "string") {
    throw new Error(`${lang}.json has no string at ${key}`);
  }
  return value;
}

/** The .xcstrings document, as an object. */
function catalogueJson(
  byLang = Object.fromEntries(LANGS.map((l) => [l, catalogue(l)])),
) {
  const strings = {};
  for (const [swiftKey, catalogueKey] of Object.entries(KEYS)) {
    strings[swiftKey] = {
      extractionState: "manual",
      localizations: Object.fromEntries(
        LANGS.map((lang) => [
          lang,
          {
            stringUnit: {
              state: "translated",
              value: lookup(byLang[lang], catalogueKey, lang),
            },
          },
        ]),
      ),
    };
  }
  return { sourceLanguage: SOURCE, strings, version: "1.0" };
}

/** What the committed file should contain, bytes included. */
function catalogueText() {
  return `${JSON.stringify(catalogueJson(), null, 2)}\n`;
}

function writeWidgetStrings({ quiet = false } = {}) {
  const text = catalogueText();
  fs.mkdirSync(path.dirname(TARGET), { recursive: true });
  const before = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, "utf8") : null;
  if (before === text) {
    if (!quiet) console.log("widget strings up to date");
    return false;
  }
  fs.writeFileSync(TARGET, text, "utf8");
  if (!quiet) console.log(`wrote ${path.relative(ROOT, TARGET)}`);
  return true;
}

module.exports = {
  KEYS,
  LANGS,
  ROOT,
  TARGET,
  catalogue,
  catalogueJson,
  catalogueText,
  writeWidgetStrings,
};

if (require.main === module) writeWidgetStrings();
