/**
 * The widget's words are the app's words.
 *
 * Nothing else can check this. `tools/find-untranslated.js` reads .js, .ts,
 * .html and .css, so the Swift and the string catalogue beside it are outside
 * every language check this repository has -- and a widget is the one screen
 * nobody opens on purpose to proofread. So the rule is enforced here instead:
 * the committed catalogue has to be exactly what the generator would write
 * from src/shared/i18n, and every key the Swift asks for has to be in it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  KEYS,
  LANGS,
  TARGET,
  catalogue,
  catalogueJson,
  catalogueText,
} from "#tools/build-widget-strings.js";

const SWIFT = path.join(path.dirname(TARGET), "QuickWidget.swift");

test("the committed catalogue is what the generator would write", () => {
  assert.equal(
    fs.readFileSync(TARGET, "utf8"),
    catalogueText(),
    `${path.basename(TARGET)} is stale -- run \`node tools/build-widget-strings.js\``,
  );
});

test("every key carries every language, with something in it", () => {
  const { strings } = catalogueJson();
  for (const key of Object.keys(KEYS)) {
    for (const lang of LANGS) {
      const value = strings[key]?.localizations?.[lang]?.stringUnit?.value;
      assert.ok(value, `${key} has no ${lang}`);
    }
  }
});

test("the Swift asks for exactly the keys that are generated", () => {
  // A key the Swift uses and the catalogue lacks does not fail the build: iOS
  // renders the key itself, so the widget reads "widget.speak" to a user. The
  // other direction is only dead weight, but it is the half that tells you
  // somebody renamed a label on one side.
  const swift = fs.readFileSync(SWIFT, "utf8");
  const used = new Set(
    [...swift.matchAll(/"(widget\.[a-zA-Z.]+)"/g)].map((m) => m[1]),
  );
  assert.deepEqual([...used].sort(), Object.keys(KEYS).sort());
});

test("the microphone says the same thing in both places", () => {
  // Not a copy of speech.start: the same entry. The glossary exists to stop
  // one act from getting two names, and a native target is exactly where that
  // would happen unnoticed.
  const { strings } = catalogueJson();
  for (const lang of LANGS) {
    assert.equal(
      strings["widget.speak"].localizations[lang].stringUnit.value,
      catalogue(lang).speech.start,
      `widget.speak drifted from speech.start in ${lang}`,
    );
  }
});
