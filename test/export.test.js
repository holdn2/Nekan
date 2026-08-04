const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSnapshot,
  toMarkdown,
  toHtml,
  defaultFileName,
  isoDay,
} = require('../src/shared/export');

const NOW = new Date(2026, 7, 2, 14, 30); // 2026-08-02 14:30, local

const task = (over = {}) => ({
  id: Math.random().toString(36).slice(2),
  text: 'x',
  quadrant: 'q1',
  dueDate: null,
  memo: null,
  createdAt: 0,
  completedAt: null,
  deletedAt: null,
  ...over,
});

test('buildSnapshot keeps the inbox out of the quadrant sections', () => {
  const snap = buildSnapshot(
    [task({ quadrant: 'inbox', text: 'a' }), task({ quadrant: 'q2', text: 'b' })],
    NOW
  );
  assert.deepEqual(
    snap.inbox.items.map((i) => i.text),
    ['a']
  );
  assert.deepEqual(
    snap.quads.map((q) => q.key),
    ['q1', 'q2', 'q3', 'q4']
  );
  assert.deepEqual(
    snap.quads.find((q) => q.key === 'q2').items.map((i) => i.text),
    ['b']
  );
  assert.equal(snap.total, 2);
});

test('buildSnapshot exports one board, with the shared inbox on both', () => {
  const list = [
    task({ text: 'work item', space: 'work' }),
    task({ text: 'life item', space: 'life' }),
    task({ text: 'unsorted', quadrant: 'inbox' }),
  ];

  const work = buildSnapshot(list, NOW, 'work');
  assert.equal(work.spaceLabel, '업무');
  assert.deepEqual(
    work.quads.find((q) => q.key === 'q1').items.map((i) => i.text),
    ['work item']
  );
  assert.deepEqual(
    work.inbox.items.map((i) => i.text),
    ['unsorted']
  );

  const life = buildSnapshot(list, NOW, 'life');
  assert.equal(life.spaceLabel, '일상');
  assert.deepEqual(
    life.quads.find((q) => q.key === 'q1').items.map((i) => i.text),
    ['life item']
  );
  // The inbox is shared, so it is in both documents rather than neither.
  assert.deepEqual(
    life.inbox.items.map((i) => i.text),
    ['unsorted']
  );
});

test('buildSnapshot puts a save from before the split on the default board', () => {
  const legacy = [{ id: 'a', text: 'old', quadrant: 'q2' }];
  assert.equal(buildSnapshot(legacy, NOW, 'work').total, 1);
  assert.equal(buildSnapshot(legacy, NOW, 'life').total, 0);
  // An unknown board name must not hide everything.
  assert.equal(buildSnapshot(legacy, NOW, 'nope').total, 1);
});

test('the board name is in the printed documents', () => {
  const snap = buildSnapshot([task({ text: 'a' })], NOW, 'life');
  assert.match(toMarkdown(snap), /^# Nekan — 일상$/m);
  assert.match(toHtml(snap), /class="board">일상</);
});

test('buildSnapshot leaves out completed and trashed tasks', () => {
  const snap = buildSnapshot(
    [
      task({ text: 'active' }),
      task({ text: 'done', completedAt: 1 }),
      task({ text: 'trashed', deletedAt: 1 }),
    ],
    NOW
  );
  assert.equal(snap.total, 1);
  assert.equal(snap.quads[0].items[0].text, 'active');
});

test('buildSnapshot normalizes, so an unknown quadrant still lands somewhere', () => {
  const snap = buildSnapshot([{ id: 'a', text: 'stray', quadrant: 'q9' }], NOW);
  assert.equal(snap.total, 1);
  assert.equal(snap.quads.find((q) => q.key === 'q4').items[0].text, 'stray');
});

test('buildSnapshot keeps list order within a quadrant', () => {
  const snap = buildSnapshot(
    [
      task({ text: 'first' }),
      task({ text: 'other', quadrant: 'q3' }),
      task({ text: 'second' }),
    ],
    NOW
  );
  assert.deepEqual(
    snap.quads[0].items.map((i) => i.text),
    ['first', 'second']
  );
});

test('the export follows orderKey, not the array', () => {
  // The array is storage order; once rows carry a key the screen and the
  // document both read that instead, or the printout disagrees with the app.
  const snap = buildSnapshot(
    [
      task({ text: 'shown second', orderKey: 'b' }),
      task({ text: 'shown first', orderKey: 'a' }),
    ],
    NOW
  );
  assert.deepEqual(
    snap.quads[0].items.map((i) => i.text),
    ['shown first', 'shown second']
  );
});

test('a purged row is not in the export', () => {
  // Deliberately no `deletedAt`: a tombstone in the real store carries one, but
  // leaving it here would let the trash filter pass this test on its own and
  // the `purgedAt` check could be deleted without anything failing.
  const snap = buildSnapshot(
    [task({ text: 'live' }), task({ text: '', purgedAt: 1 })],
    NOW
  );
  assert.equal(snap.total, 1);
  assert.deepEqual(
    snap.quads[0].items.map((i) => i.text),
    ['live']
  );
});

test('due dates carry both the date and the relative hint', () => {
  const snap = buildSnapshot([task({ dueDate: '2026-08-03' })], NOW);
  const { due } = snap.quads[0].items[0];
  assert.equal(due.text, '8/3(월)');
  assert.equal(due.hint, '내일');
  assert.equal(due.state, 'soon');
});

test('an invalid due date exports as no due date', () => {
  const snap = buildSnapshot([task({ dueDate: '2026-02-31' })], NOW);
  assert.equal(snap.quads[0].items[0].due, null);
});

test('markdown lists every section, empty ones included', () => {
  const md = toMarkdown(
    buildSnapshot([task({ quadrant: 'inbox', text: 'dump' })], NOW)
  );
  assert.match(md, /^# Nekan/);
  assert.match(md, /## 다 꺼내기[\s\S]*1\. dump/);
  assert.match(md, /## Urgent & Important[\s\S]*비어 있음/);
  assert.equal(md.endsWith('\n'), true);
});

test('markdown indents a memo under its item and neutralizes pipes', () => {
  const md = toMarkdown(
    buildSnapshot([task({ text: 'a|b', memo: 'line one\nline two' })], NOW)
  );
  assert.match(md, /1\. a\\\|b/);
  assert.match(md, /   > line one\n   > line two/);
});

test('html escapes text so a task cannot inject markup', () => {
  const html = toHtml(buildSnapshot([task({ text: '<script>bad</script>' })], NOW));
  assert.equal(html.includes('<script>bad'), false);
  assert.match(html, /&lt;script&gt;bad/);
});

test('html is a standalone document with no external references', () => {
  const html = toHtml(buildSnapshot([task({ text: 'a' })], NOW));
  assert.match(html, /^<!doctype html>/);
  assert.equal(/<link|<script|https?:\/\//.test(html), false);
});

test('html renders a memo with its line breaks preserved', () => {
  const html = toHtml(buildSnapshot([task({ memo: 'one\ntwo' })], NOW));
  assert.match(html, /class="memo">one<br>two<\/p>/);
});

test('the suggested file name carries the board, the day and the format', () => {
  assert.equal(isoDay(NOW), '2026-08-02');
  assert.equal(
    defaultFileName(NOW, 'pdf', 'work'),
    'Nekan 업무 2026-08-02.pdf'
  );
  assert.equal(
    defaultFileName(NOW, 'md', 'life'),
    'Nekan 일상 2026-08-02.md'
  );
  // The two exports must not be offered the same name.
  assert.notEqual(
    defaultFileName(NOW, 'pdf', 'work'),
    defaultFileName(NOW, 'pdf', 'life')
  );
});

test('an empty board reports a zero total so the caller can refuse', () => {
  assert.equal(buildSnapshot([], NOW).total, 0);
  assert.equal(buildSnapshot([task({ completedAt: 1 })], NOW).total, 0);
});
