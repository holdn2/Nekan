/**
 * Which rows reach the page, in what order, and what a due date says there.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSnapshot,
  toMarkdown,
  toHtml,
  defaultFileName,
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

test("buildSnapshot keeps the inbox out of the quadrant sections", () => {
  const snap = snapshotOf(
    [
      task({ quadrant: "inbox", text: "a" }),
      task({ quadrant: "q2", text: "b" }),
    ],
    NOW,
  );
  assert.deepEqual(
    snap.inbox.items.map((i) => i.text),
    ["a"],
  );
  assert.deepEqual(
    snap.quads.map((q) => q.key),
    ["q1", "q2", "q3", "q4"],
  );
  assert.deepEqual(
    snap.quads.find((q) => q.key === "q2").items.map((i) => i.text),
    ["b"],
  );
  assert.equal(snap.total, 2);
});

test("buildSnapshot exports one board, with the shared inbox on both", () => {
  const list = [
    task({ text: "work item", space: "work" }),
    task({ text: "life item", space: "life" }),
    task({ text: "unsorted", quadrant: "inbox" }),
  ];

  const work = snapshotOf(list, NOW, "work");
  assert.equal(work.spaceLabel, "업무");
  assert.deepEqual(
    work.quads.find((q) => q.key === "q1").items.map((i) => i.text),
    ["work item"],
  );
  assert.deepEqual(
    work.inbox.items.map((i) => i.text),
    ["unsorted"],
  );

  const life = snapshotOf(list, NOW, "life");
  assert.equal(life.spaceLabel, "일상");
  assert.deepEqual(
    life.quads.find((q) => q.key === "q1").items.map((i) => i.text),
    ["life item"],
  );
  // The inbox is shared, so it is in both documents rather than neither.
  assert.deepEqual(
    life.inbox.items.map((i) => i.text),
    ["unsorted"],
  );
});

test("buildSnapshot puts a save from before the split on the default board", () => {
  const legacy = [{ id: "a", text: "old", quadrant: "q2" }];
  assert.equal(snapshotOf(legacy, NOW, "work").total, 1);
  assert.equal(snapshotOf(legacy, NOW, "life").total, 0);
  // An unknown board name must not hide everything.
  assert.equal(snapshotOf(legacy, NOW, "nope").total, 1);
});

test("the board name is in the printed documents", () => {
  const snap = snapshotOf([task({ text: "a" })], NOW, "life");
  assert.match(toMarkdown(snap), /^# Nekan — 일상$/m);
  assert.match(toHtml(snap), /class="board">일상</);
});

test("buildSnapshot leaves out completed and trashed tasks", () => {
  const snap = snapshotOf(
    [
      task({ text: "active" }),
      task({ text: "done", completedAt: 1 }),
      task({ text: "trashed", deletedAt: 1 }),
    ],
    NOW,
  );
  assert.equal(snap.total, 1);
  assert.equal(snap.quads[0].items[0].text, "active");
});

test("buildSnapshot normalizes, so an unknown quadrant still lands somewhere", () => {
  const snap = snapshotOf([{ id: "a", text: "stray", quadrant: "q9" }], NOW);
  assert.equal(snap.total, 1);
  assert.equal(snap.quads.find((q) => q.key === "q4").items[0].text, "stray");
});

test("buildSnapshot keeps list order within a quadrant", () => {
  const snap = snapshotOf(
    [
      task({ text: "first" }),
      task({ text: "other", quadrant: "q3" }),
      task({ text: "second" }),
    ],
    NOW,
  );
  assert.deepEqual(
    snap.quads[0].items.map((i) => i.text),
    ["first", "second"],
  );
});

test("the export follows orderKey, not the array", () => {
  // The array is storage order; once rows carry a key the screen and the
  // document both read that instead, or the printout disagrees with the app.
  const snap = snapshotOf(
    [
      task({ text: "shown second", orderKey: "b" }),
      task({ text: "shown first", orderKey: "a" }),
    ],
    NOW,
  );
  assert.deepEqual(
    snap.quads[0].items.map((i) => i.text),
    ["shown first", "shown second"],
  );
});

test("a purged row is not in the export", () => {
  // Deliberately no `deletedAt`: a tombstone in the real store carries one, but
  // leaving it here would let the trash filter pass this test on its own and
  // the `purgedAt` check could be deleted without anything failing.
  const snap = snapshotOf(
    [task({ text: "live" }), task({ text: "", purgedAt: 1 })],
    NOW,
  );
  assert.equal(snap.total, 1);
  assert.deepEqual(
    snap.quads[0].items.map((i) => i.text),
    ["live"],
  );
});

test("due dates carry both the date and the relative hint", () => {
  const snap = snapshotOf([task({ dueDate: "2026-08-03" })], NOW);
  const { due } = snap.quads[0].items[0];
  assert.equal(due.text, "8/3(월)");
  assert.equal(due.hint, "내일");
  assert.equal(due.state, "soon");
});

test("an invalid due date exports as no due date", () => {
  const snap = snapshotOf([task({ dueDate: "2026-02-31" })], NOW);
  assert.equal(snap.quads[0].items[0].due, null);
});
