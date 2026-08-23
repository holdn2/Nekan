/**
 * The snapshot as Markdown.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { buildSnapshot, toMarkdown, defaultFileName } from "#shared/export.js";
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

test("markdown lists every section, empty ones included", () => {
  const md = toMarkdown(
    snapshotOf([task({ quadrant: "inbox", text: "dump" })], NOW),
  );
  assert.match(md, /^# Nekan/);
  assert.match(md, /## 다 꺼내기[\s\S]*1\. dump/);
  assert.match(md, /## Urgent & Important[\s\S]*비어 있음/);
  assert.equal(md.endsWith("\n"), true);
});

test("markdown indents a memo under its item and neutralizes pipes", () => {
  const md = toMarkdown(
    snapshotOf([task({ text: "a|b", memo: "line one\nline two" })], NOW),
  );
  assert.match(md, /1\. a\\\|b/);
  assert.match(md, /   > line one\n   > line two/);
});
