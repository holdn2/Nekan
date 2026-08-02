const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  defaultStore,
  loadStore,
  writeStore,
} = require('../src/shared/store-io');
const { DEFAULT_SPACE } = require('../src/shared/core');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'em-store-'));
}

test('writeStore round-trips through loadStore', () => {
  const target = path.join(tmpDir(), 'nested', 'data.json');
  const store = defaultStore();
  store.tasks = [{ id: 'a', text: '할 일', quadrant: 'q1' }];

  assert.equal(writeStore(target, store), true);
  assert.deepEqual(loadStore(target).tasks, store.tasks);
});

test('writeStore leaves no temp file behind', () => {
  const dir = tmpDir();
  const target = path.join(dir, 'data.json');
  writeStore(target, defaultStore());
  assert.deepEqual(fs.readdirSync(dir), ['data.json']);
});

test('an interrupted write cannot truncate the previous file', () => {
  const dir = tmpDir();
  const target = path.join(dir, 'data.json');
  const good = defaultStore();
  good.tasks = [{ id: 'a', text: 'keep me', quadrant: 'q1' }];
  writeStore(target, good);

  // A value JSON.stringify throws on: the temp write fails mid-save.
  const broken = defaultStore();
  broken.tasks = [{ id: 'b', text: 'x', self: null }];
  broken.tasks[0].self = broken.tasks[0];
  assert.equal(writeStore(target, broken), false);

  assert.deepEqual(loadStore(target).tasks, good.tasks);
});

test('loadStore falls back to defaults on a corrupt or missing file', () => {
  const dir = tmpDir();
  const missing = path.join(dir, 'nope.json');
  assert.deepEqual(loadStore(missing), defaultStore());

  const corrupt = path.join(dir, 'half.json');
  fs.writeFileSync(corrupt, '{"tasks": [{"id":"a"', 'utf8');
  assert.deepEqual(loadStore(corrupt), defaultStore());
});

test('loadStore keeps unknown settings out of the way of defaults', () => {
  const target = path.join(tmpDir(), 'data.json');
  fs.writeFileSync(
    target,
    JSON.stringify({ tasks: 'not an array', settings: { theme: 'dark' } }),
    'utf8',
  );

  const store = loadStore(target);
  assert.deepEqual(store.tasks, []);
  assert.equal(store.settings.theme, 'dark');
  assert.equal(store.settings.alwaysOnTop, true);
  assert.deepEqual(store.settings.layout, defaultStore().settings.layout);
  // A save from before the 업무/일상 split has no choice recorded; it has to
  // open on a real board rather than on undefined.
  assert.equal(store.settings.activeSpace, DEFAULT_SPACE);
});

test('the legacy store is copied once, and never over an existing file', () => {
  const dir = tmpDir();
  const legacy = path.join(dir, 'legacy', 'data.json');
  const target = path.join(dir, 'current', 'data.json');
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  fs.writeFileSync(
    legacy,
    JSON.stringify({ tasks: [{ id: 'old', text: 'old', quadrant: 'q2' }] }),
    'utf8',
  );

  assert.equal(loadStore(target, legacy).tasks[0].id, 'old');

  const current = defaultStore();
  current.tasks = [{ id: 'new', text: 'new', quadrant: 'q1' }];
  writeStore(target, current);
  assert.equal(loadStore(target, legacy).tasks[0].id, 'new');
});
