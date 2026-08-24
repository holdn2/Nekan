/**
 * The document as a whole: its suggested name, its total, its language.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSnapshot,
  toMarkdown,
  toHtml,
  defaultFileName,
  isoDay,
} from "#shared/export.js";
import { initI18n, setMainLanguage, t } from "#main/i18n.js";

const NOW = new Date(2026, 7, 2, 14, 30); // 2026-08-02 14:30, local

// The real catalogues, not a stub. shared/export.js holds no strings of its own
// any more -- it is handed a `t` and resolves every word into the snapshot --
// so a test with a fake `t` would assert that the plumbing works while proving
// nothing about what actually comes out of the app.
initI18n("ko");
const inKorean = { t, locale: "ko" };

/** buildSnapshot with the language bound, so the cases below stay readable. */
const snapshotOf = (
  tasks: unknown,
  now: Date = NOW,
  space?: unknown,
  i18n = inKorean,
) => buildSnapshot(tasks, now, space, i18n);

/** Same, for the one function that names a file rather than filling it. */
const nameOf = (now: Date, ext: string, space?: unknown) =>
  defaultFileName(now, ext, space, t);

const task = (over = {}) => ({
  id: Math.random().toString(36).slice(2),
  text: "x",
  quadrant: "q1",
  dueDate: null,
  memo: null,
  createdAt: 0,
  completedAt: null,
  deletedAt: null,
  ...over,
});

test("the suggested file name carries the board, the day and the format", () => {
  assert.equal(isoDay(NOW), "2026-08-02");
  assert.equal(nameOf(NOW, "pdf", "work"), "Nekan 업무 2026-08-02.pdf");
  assert.equal(nameOf(NOW, "md", "life"), "Nekan 일상 2026-08-02.md");
  // The two exports must not be offered the same name.
  assert.notEqual(nameOf(NOW, "pdf", "work"), nameOf(NOW, "pdf", "life"));
});

test("an empty board reports a zero total so the caller can refuse", () => {
  assert.equal(snapshotOf([], NOW).total, 0);
  assert.equal(snapshotOf([task({ completedAt: 1 })], NOW).total, 0);
});

test("the whole document follows the language it was built with", () => {
  const list = [task({ text: "a", dueDate: "2026-08-03" })];

  const ko = snapshotOf(list, NOW, "work");
  assert.equal(ko.spaceLabel, "업무");
  assert.equal(ko.inbox.title, "다 꺼내기");
  assert.match(toHtml(ko), /<html lang="ko">/);

  setMainLanguage("en");
  const en = snapshotOf(list, NOW, "work", { t, locale: "en" });
  setMainLanguage("ko");

  // Every layer of the document, not just the title: the board name, a section
  // heading, the words a printed due date carries, and the empty-quadrant line
  // the formatters read out of the snapshot rather than asking for.
  assert.equal(en.spaceLabel, "Work");
  assert.equal(en.inbox.title, "Brain dump");
  assert.equal(en.quads.find((q) => q.key === "q1").action, "Do it now");
  assert.match(en.quads.find((q) => q.key === "q1").items[0].due.line, /^due /);
  assert.match(toHtml(en), /<html lang="en">/);
  assert.match(toMarkdown(en), /^# Nekan — Work$/m);
  assert.match(toMarkdown(en), /_\(Empty\)_/);
  assert.equal(/[가-힣]/.test(toMarkdown(en)), false);
});
