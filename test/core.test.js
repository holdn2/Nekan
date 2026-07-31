const test = require('node:test');
const assert = require('node:assert/strict');

const {
  QUADS,
  MAX_TEXT,
  startOfToday,
  startOfTomorrow,
  parseDue,
  dueInfo,
  clampText,
  normalizeTasks,
  sanitizeLayout,
  DEFAULT_LAYOUT,
  MIN_RATIO,
  MAX_RATIO,
} = require('../src/shared/core');

/** Local 'YYYY-MM-DD' for a day offset from today, the way the UI writes it. */
function dayString(offset) {
  const d = startOfToday();
  d.setDate(d.getDate() + offset);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

test('normalizeTasks fills fields older saves predate', () => {
  const [task] = normalizeTasks([{ id: 'a', text: 'x', quadrant: 'q2' }]);
  assert.equal(task.dueDate, null);
  assert.equal(task.completedAt, null);
  assert.equal(task.deletedAt, null);
});

test('normalizeTasks keeps existing values, including falsy timestamps', () => {
  const [task] = normalizeTasks([
    { id: 'a', text: 'x', quadrant: 'q1', dueDate: '2026-01-02', completedAt: 5 },
  ]);
  assert.equal(task.dueDate, '2026-01-02');
  assert.equal(task.completedAt, 5);
});

test('normalizeTasks rescues an unknown quadrant', () => {
  const bad = [
    { id: 'a', text: 'a', quadrant: 'q5' },
    { id: 'b', text: 'b' },
    { id: 'c', text: 'c', quadrant: null },
  ];
  for (const task of normalizeTasks(bad)) {
    assert.ok(QUADS.includes(task.quadrant), `${task.id} landed outside QUADS`);
  }
});

test('normalizeTasks never drops entries', () => {
  const list = [
    { id: 'a', text: 'a', quadrant: 'q1' },
    { id: 'b', text: 'b', quadrant: 'zzz', deletedAt: 1 },
    { id: 'c', text: 'c', quadrant: 'q3', completedAt: 2 },
  ];
  assert.equal(normalizeTasks(list).length, 3);
  assert.deepEqual(
    normalizeTasks(list).map((t) => t.id),
    ['a', 'b', 'c'],
  );
});

test('normalizeTasks tolerates a missing or broken tasks array', () => {
  assert.deepEqual(normalizeTasks(undefined), []);
  assert.deepEqual(normalizeTasks(null), []);
  assert.deepEqual(normalizeTasks('nope'), []);
});

test('clampText trims and caps at the shared limit', () => {
  assert.equal(clampText('  hi  '), 'hi');
  assert.equal(clampText('x'.repeat(MAX_TEXT + 50)).length, MAX_TEXT);
  assert.equal(clampText(null), '');
  assert.equal(clampText(undefined), '');
});

test('parseDue accepts only real YYYY-MM-DD days', () => {
  assert.equal(parseDue('2026-02-31'), null);
  assert.equal(parseDue('2026-13-01'), null);
  assert.equal(parseDue('26-01-01'), null);
  assert.equal(parseDue(''), null);
  assert.equal(parseDue(null), null);
  assert.equal(parseDue('2026-03-09').getDate(), 9);
});

test('dueInfo classifies days relative to today', () => {
  assert.equal(dueInfo(dayString(-2)).state, 'overdue');
  assert.equal(dueInfo(dayString(-2)).hint, '2일 지남');
  assert.equal(dueInfo(dayString(0)).state, 'today');
  assert.equal(dueInfo(dayString(1)).hint, '내일');
  assert.equal(dueInfo(dayString(3)).state, 'soon');
  assert.equal(dueInfo(dayString(4)).state, 'far');
  assert.equal(dueInfo(null), null);
});

test('dueInfo is relative to the day it is asked about, not the parse', () => {
  const due = '2026-03-10';
  const before = new Date(2026, 2, 9, 23, 59, 59);
  const after = new Date(2026, 2, 10, 0, 0, 1);
  assert.equal(dueInfo(due, before).state, 'soon');
  assert.equal(dueInfo(due, before).hint, '내일');
  // Same task, one second later: the label must move on its own.
  assert.equal(dueInfo(due, after).state, 'today');
});

test('dueInfo prefixes the year only when it differs from now', () => {
  const now = new Date(2026, 5, 1);
  assert.equal(dueInfo('2026-06-10', now).text.startsWith('6/10'), true);
  assert.equal(dueInfo('2027-06-10', now).text.startsWith('27/'), true);
});

test('startOfTomorrow lands on the next local midnight', () => {
  const now = new Date(2026, 2, 9, 17, 30, 12, 400);
  const next = startOfTomorrow(now);
  assert.equal(next.getDate(), 10);
  assert.equal(next.getHours(), 0);
  assert.equal(next.getMinutes(), 0);
  assert.ok(next.getTime() > now.getTime());
});

test('sanitizeLayout clamps ratios into the drag range', () => {
  assert.deepEqual(sanitizeLayout({ cols: 0.01, rows: 0.99 }), {
    cols: MIN_RATIO,
    rows: MAX_RATIO,
  });
  assert.deepEqual(sanitizeLayout({ cols: 0.3, rows: 0.7 }), {
    cols: 0.3,
    rows: 0.7,
  });
});

test('sanitizeLayout falls back to an even split for junk', () => {
  for (const junk of [undefined, null, {}, { cols: null, rows: '0.4' }, { cols: NaN }]) {
    assert.deepEqual(sanitizeLayout(junk), DEFAULT_LAYOUT);
  }
});

test('sanitizeLayout averages the legacy per-column row split', () => {
  assert.deepEqual(sanitizeLayout({ cols: 0.4, left: 0.3, right: 0.5 }), {
    cols: 0.4,
    rows: 0.4,
  });
});
