/**
 * The caps on typed text, and turning a pasted block into rows.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_TEXT,
  MAX_BULK_LINES,
  splitBulkText,
  MAX_MEMO,
  clampText,
  clampMemo,
} from "#shared/core.js";

test("splitBulkText turns a pasted block into one task per line", () => {
  assert.deepEqual(splitBulkText("보고서 초안\n치과 예약\n회고 정리"), [
    "보고서 초안",
    "치과 예약",
    "회고 정리",
  ]);
});

test("splitBulkText drops blank lines and pasted list markers", () => {
  assert.deepEqual(
    splitBulkText("- 보고서\r\n\r\n* 치과\n1. 회고\n2) 운동\n   \n• 장보기"),
    ["보고서", "치과", "회고", "운동", "장보기"],
  );
});

test("splitBulkText applies the same caps as a typed task", () => {
  assert.deepEqual(splitBulkText("  여백  "), ["여백"]);
  assert.equal(splitBulkText("x".repeat(MAX_TEXT + 50))[0].length, MAX_TEXT);
  const flood = Array.from({ length: MAX_BULK_LINES + 40 }, (_, i) => `t${i}`);
  assert.equal(splitBulkText(flood.join("\n")).length, MAX_BULK_LINES);
});

test("splitBulkText yields nothing for input that is all whitespace", () => {
  assert.deepEqual(splitBulkText("\n\n   \n"), []);
  assert.deepEqual(splitBulkText(null), []);
  assert.deepEqual(splitBulkText(undefined), []);
});

test("clampText trims and caps at the shared limit", () => {
  assert.equal(clampText("  hi  "), "hi");
  assert.equal(clampText("x".repeat(MAX_TEXT + 50)).length, MAX_TEXT);
  assert.equal(clampText(null), "");
  assert.equal(clampText(undefined), "");
});

test("clampMemo trims, caps, and turns blank into null", () => {
  assert.equal(clampMemo("  note  "), "note");
  assert.equal(clampMemo("line\nline"), "line\nline");
  assert.equal(clampMemo("x".repeat(MAX_MEMO + 50)).length, MAX_MEMO);
  assert.equal(clampMemo("   "), null);
  assert.equal(clampMemo(""), null);
  assert.equal(clampMemo(null), null);
  assert.equal(clampMemo(undefined), null);
});
