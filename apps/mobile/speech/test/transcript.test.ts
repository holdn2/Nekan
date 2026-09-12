/**
 * The parts of dictation a device is not required to check.
 */

import { expect, test } from "vitest";
import { composeDictation, hasModelFor, speechLocale } from "../transcript";

test("the recogniser is asked for a region, not a bare language", () => {
  // iOS answers "language-not-supported" to a bare tag, which reads on screen
  // as the microphone being broken.
  expect(speechLocale("ko")).toBe("ko-KR");
  expect(speechLocale("en")).toBe("en-US");
});

test("an unknown or missing language falls back rather than failing", () => {
  expect(speechLocale(null)).toBe("en-US");
  expect(speechLocale("")).toBe("en-US");
  expect(speechLocale("fr")).toBe("en-US");
});

test("a longer version of the same sentence replaces the shorter one", () => {
  // This is what streaming looks like: not new words to append, but the whole
  // sentence again. Appending would give "우유 우유 사기".
  const base = "";
  expect(composeDictation(base, "우유")).toBe("우유");
  expect(composeDictation(base, "우유 사기")).toBe("우유 사기");
});

test("what was already typed is kept in front", () => {
  expect(composeDictation("장보기:", "우유 사기")).toBe("장보기: 우유 사기");
});

test("no space is invented where one would look wrong", () => {
  expect(composeDictation("", "우유")).toBe("우유");
  expect(composeDictation("첫 줄\n", "둘째 줄")).toBe("첫 줄\n둘째 줄");
  expect(composeDictation("장보기 ", "우유")).toBe("장보기 우유");
});

test("silence leaves the field alone", () => {
  expect(composeDictation("이미 쓴 것", "")).toBe("이미 쓴 것");
  expect(composeDictation("이미 쓴 것", "   ")).toBe("이미 쓴 것");
});

test("a model is matched on the language, not the exact tag", () => {
  // Platforms report what they hold in their own shape. A strict match turns
  // the feature off on a device that can do the job.
  expect(hasModelFor("ko-KR", ["ko-KR", "en-US"])).toBe(true);
  expect(hasModelFor("ko-KR", ["ko_KR"])).toBe(true);
  expect(hasModelFor("ko-KR", ["ko"])).toBe(true);
  expect(hasModelFor("en-US", ["en-GB"])).toBe(true);
});

test("a language the device does not hold is not a match", () => {
  expect(hasModelFor("ko-KR", ["en-US", "ja-JP"])).toBe(false);
  expect(hasModelFor("ko-KR", [])).toBe(false);
});
