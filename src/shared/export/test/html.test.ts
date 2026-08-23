/**
 * The snapshot as HTML -- which is also what the PDF is printed from.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { buildSnapshot, toHtml, defaultFileName } from "#shared/export.js";
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

test("html escapes text so a task cannot inject markup", () => {
  const html = toHtml(
    snapshotOf([task({ text: "<script>bad</script>" })], NOW),
  );
  assert.equal(html.includes("<script>bad"), false);
  assert.match(html, /&lt;script&gt;bad/);
});

test("html is a standalone document with no external references", () => {
  const html = toHtml(snapshotOf([task({ text: "a" })], NOW));
  assert.match(html, /^<!doctype html>/);
  assert.equal(/<link|<script|https?:\/\//.test(html), false);
  // Portable means no reference to this machine either: no face, no url().
  assert.equal(/@font-face|url\(/.test(html), false);
});

test("the printed copy may name a font file, and the saved one may not", () => {
  const snap = snapshotOf([task({ text: "a" })], NOW);
  const url = "file:///C:/Program%20Files/Nekan/PretendardVariable.woff2";

  const printed = toHtml(snap, { fontUrl: url });
  assert.match(printed, /@font-face\{font-family:"Pretendard Variable"/);
  assert.equal(printed.includes(url), true);
  assert.match(printed, /font-weight:100 900/);

  // The saved copy travels to other machines, so it must stay portable.
  assert.equal(toHtml(snap).includes("Program%20Files"), false);
});

test("both copies ask for the same typeface before falling back", () => {
  for (const html of [
    toHtml(snapshotOf([task({ text: "a" })], NOW)),
    toHtml(snapshotOf([task({ text: "a" })], NOW), { fontUrl: "x.woff2" }),
  ]) {
    assert.match(html, /font-family: "Pretendard Variable", "Pretendard",/);
  }
});

test("html renders a memo with its line breaks preserved", () => {
  const html = toHtml(snapshotOf([task({ memo: "one\ntwo" })], NOW));
  assert.match(html, /class="memo">one<br>two<\/p>/);
});

// A quadrant that runs past the page is capped, and the document says so.
