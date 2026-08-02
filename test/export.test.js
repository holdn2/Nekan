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

test('buildSnapshot exports only the active board', () => {
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
  assert.match(md, /^# 아이젠하워 매트릭스/);
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

test('the suggested file name carries the day and the format', () => {
  assert.equal(isoDay(NOW), '2026-08-02');
  assert.equal(defaultFileName(NOW), '아이젠하워 매트릭스 2026-08-02.pdf');
  assert.equal(defaultFileName(NOW, 'md'), '아이젠하워 매트릭스 2026-08-02.md');
});

test('an empty board reports a zero total so the caller can refuse', () => {
  assert.equal(buildSnapshot([], NOW).total, 0);
  assert.equal(buildSnapshot([task({ completedAt: 1 })], NOW).total, 0);
});
