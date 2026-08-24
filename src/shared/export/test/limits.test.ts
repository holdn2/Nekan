/**
 * The ceiling on how many rows of one section a document prints.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { buildSnapshot, toMarkdown, toHtml } from "#shared/export.js";
import { initI18n, t } from "#main/i18n.js";
import { orderKeyBetween } from "#shared/core.js";

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

// The numbers here are the ones that made the ceiling necessary: 300 rows
// printed as 11 pages with the neighbouring quadrant an empty box.
const manyIn = (quadrant, n) =>
  Array.from({ length: n }, (_, i) =>
    task({ quadrant, text: "row " + (i + 1) }),
  );

test("a long list is cut to twenty and the section says how many are left", () => {
  const snap = snapshotOf(manyIn("q2", 25));
  const q2 = snap.quads.find((q) => q.key === "q2");

  assert.equal(q2.items.length, 20);
  assert.equal(q2.hidden, 5);
  // The count is the quadrant's, not the page's -- a number that shrank to
  // twenty would read as tasks having gone missing.
  assert.equal(q2.count, 25);
  assert.equal(snap.total, 25);
  assert.equal(snap.truncated, true);

  const html = toHtml(snap);
  assert.equal((html.match(/<li>/g) || []).length, 20);
  assert.match(html, /<span class="n">25<\/span>/);
  assert.match(html, /class="more">출력하지 않은 항목이 5개 더 있습니다/);
  assert.match(html, /각 분면에서 최대 20개까지만 출력됩니다/);

  const md = toMarkdown(snap);
  assert.match(md, /_출력하지 않은 항목이 5개 더 있습니다_/);
  assert.match(md, /각 분면에서 최대 20개까지만 출력됩니다/);
  assert.equal(md.includes("21. row 21"), false);
});

test("a board that fits says nothing about a limit", () => {
  const snap = snapshotOf(manyIn("q2", 20));
  assert.equal(snap.truncated, false);
  assert.equal(snap.labels.limit, "");

  const html = toHtml(snap);
  assert.equal(html.includes('class="more"'), false);
  assert.equal(html.includes("최대 20개"), false);
  assert.equal(toMarkdown(snap).includes("최대 20개"), false);
});

test("the brain dump is capped on the same terms as a quadrant", () => {
  const snap = snapshotOf(manyIn("inbox", 23));
  assert.equal(snap.inbox.items.length, 20);
  assert.equal(snap.inbox.hidden, 3);
  assert.equal(snap.inbox.count, 23);
});

test("the cut follows the quadrant's order, not the order rows are stored", () => {
  // Storage order is not the user's order -- orderKey is. Rows go in
  // backwards to prove the cut sorts before it slices.
  //
  // The keys come from the app's own generator rather than being written by
  // hand: a padded decimal looks ordered but normalizeTasks rejects anything
  // ending in the lowest digit ("020" came back as "01"), and a rejected key
  // is refilled from array position -- exactly what this test rules out.
  const keys = [];
  for (let i = 0, k = null; i < 22; i++) {
    k = orderKeyBetween(k, null);
    keys.push(k);
  }

  const rows = keys
    .map((orderKey, i) => task({ quadrant: "q2", text: "row " + i, orderKey }))
    .reverse();
  const snap = snapshotOf(rows);
  const q2 = snap.quads.find((q) => q.key === "q2");

  assert.equal(q2.items[0].text, "row 0");
  assert.equal(q2.items[19].text, "row 19");
  assert.equal(
    q2.items.some((i) => i.text === "row 20" || i.text === "row 21"),
    false,
  );
});
