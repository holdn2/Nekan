/**
 * The keys that order rows inside one quadrant.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeTasks,
  isOrderKey,
  orderKeyBetween,
  compareOrder,
} from "#shared/core.js";

/* -------------------------------------------------------------- order keys */

test("an order key lands strictly between its neighbours", () => {
  const a = orderKeyBetween(null, null);
  const before = orderKeyBetween(null, a);
  const after = orderKeyBetween(a, null);
  assert.ok(before < a, `${before} < ${a}`);
  assert.ok(a < after, `${a} < ${after}`);

  const middle = orderKeyBetween(a, after);
  assert.ok(a < middle && middle < after, `${a} < ${middle} < ${after}`);
});

test("there is always room between two keys, however close", () => {
  // Repeatedly inserting at the same spot is the case that breaks a scheme
  // built on numbers: eventually there is no value left between two rows.
  let low = orderKeyBetween(null, null);
  let high = orderKeyBetween(low, null);
  for (let i = 0; i < 200; i += 1) {
    const mid = orderKeyBetween(low, high);
    assert.ok(low < mid && mid < high, `round ${i}: ${low} < ${mid} < ${high}`);
    high = mid;
  }
});

test("appending stays ordered over a long run", () => {
  const keys = [];
  let last = null;
  for (let i = 0; i < 200; i += 1) {
    last = orderKeyBetween(last, null);
    keys.push(last);
  }
  assert.deepEqual(keys, [...keys].sort());
});

test("appending does not grow the key without bound", () => {
  // Halving the distance to the end of the list gave five appends per
  // character: a thousand rows carried 200-character keys, and every one of
  // them went to the server on each sync. Stepping a digit instead is what
  // keeps this flat, so the bound is the point of the test.
  let last = null;
  for (let i = 0; i < 1000; i += 1) last = orderKeyBetween(last, null);
  assert.ok(last.length <= 20, `1000 appends produced ${last.length} chars`);
  assert.ok(isOrderKey(last), `got ${last}`);
});

test("new keys sort after the ones the old midpoint scheme wrote", () => {
  // No migration: a quadrant filled before this change keeps its keys, and
  // rows added afterwards land in the same list. 'zzzz' is where the old
  // scheme ended up after a few hundred appends, and it is the shape most
  // likely to trip a stepping rule — every digit is already the last one.
  const existing = ["V", "n", "z", "zV", "zn", "zz", "zzV", "zzz"];
  const keys = [...existing];
  let last = existing[existing.length - 1];
  for (let i = 0; i < 100; i += 1) {
    last = orderKeyBetween(last, null);
    keys.push(last);
  }
  assert.deepEqual(keys, [...keys].sort());
  assert.ok(keys.every(isOrderKey));
});

test("a drop between two neighbours still lands between them", () => {
  // Stepping leaves consecutive keys adjacent, so this is the case that pays
  // for the shorter appends. It has to keep working, and repeatedly.
  let a = orderKeyBetween(null, null);
  let b = orderKeyBetween(a, null);
  for (let i = 0; i < 50; i += 1) {
    const mid = orderKeyBetween(a, b);
    assert.ok(a < mid && mid < b, `${a} < ${mid} < ${b} failed at ${i}`);
    assert.ok(isOrderKey(mid), `got ${mid}`);
    b = mid;
  }
});

test("prepending stays ordered over a long run", () => {
  const keys = [];
  let first = null;
  for (let i = 0; i < 200; i += 1) {
    first = orderKeyBetween(null, first);
    keys.unshift(first);
  }
  assert.deepEqual(keys, [...keys].sort());
});

test("a pair already out of sequence still yields a usable key", () => {
  // A hand-edited or half-synced file can hand us a reversed pair; the drop has
  // to complete anyway, landing before the row it was aimed at.
  const low = orderKeyBetween(null, null);
  const high = orderKeyBetween(low, null);
  const got = orderKeyBetween(high, low);
  assert.ok(got < low, `${got} < ${low}`);
});

test("a key with no room in front of it is not a key", () => {
  // '0' is the trap: there is nothing between the head of the list and it, so
  // orderKeyBetween(null, '0') can only answer '00…' — which sorts *after*
  // '0' and would drop a row below the one it was aimed above.
  assert.equal(isOrderKey("0"), false);
  assert.equal(isOrderKey("V0"), false);
  assert.equal(isOrderKey(""), false);
  assert.equal(isOrderKey("V~"), false, "digit outside the alphabet");
  assert.equal(isOrderKey(null), false);
  assert.equal(isOrderKey("V"), true);
  assert.equal(isOrderKey("0V"), true, "a leading lowest digit is fine");
});

test("normalizeTasks replaces a key that cannot be inserted in front of", () => {
  const [zero] = normalizeTasks([
    { id: "a", quadrant: "q1", space: "work", orderKey: "0" },
  ]);
  assert.ok(isOrderKey(zero.orderKey), `got ${zero.orderKey}`);

  const [junk] = normalizeTasks([
    { id: "b", quadrant: "q1", space: "work", orderKey: "~~" },
  ]);
  assert.ok(isOrderKey(junk.orderKey), `got ${junk.orderKey}`);
});

test("a drop above a repaired row really lands above it", () => {
  // The whole point of rejecting '0': before the repair this ordered a, c, b.
  const [head, tail] = normalizeTasks([
    { id: "a", quadrant: "q1", space: "work", orderKey: "0" },
    { id: "b", quadrant: "q1", space: "work", orderKey: "V" },
  ]);
  const dropped = { id: "c", orderKey: orderKeyBetween(null, head.orderKey) };
  const order = [head, tail, dropped].sort(compareOrder).map((t) => t.id);
  assert.deepEqual(order, ["c", "a", "b"]);
});

test("orderKeyBetween ignores a neighbour it could not have produced", () => {
  // A drag must still complete when the file holds a key from somewhere else.
  assert.ok(isOrderKey(orderKeyBetween("~~", null)));
  assert.ok(isOrderKey(orderKeyBetween(null, "~~")));
  assert.ok(isOrderKey(orderKeyBetween("0", "0")));
});

test("compareOrder falls back to the id so the sort is total", () => {
  const a = { id: "a", orderKey: "V" };
  const b = { id: "b", orderKey: "V" };
  assert.ok(compareOrder(a, b) < 0);
  assert.ok(compareOrder(b, a) > 0);
  assert.equal(compareOrder(a, a), 0);
});

test("normalizeTasks keeps the array order of a save that predates orderKey", () => {
  const saved = ["first", "second", "third"].map((id) => ({
    id,
    quadrant: "q1",
    space: "work",
  }));
  const sorted = normalizeTasks(saved).sort(compareOrder);
  assert.deepEqual(
    sorted.map((t) => t.id),
    ["first", "second", "third"],
  );
});

test("order keys are per quadrant and per board, not global", () => {
  const saved = [
    { id: "w1", quadrant: "q1", space: "work" },
    { id: "l1", quadrant: "q1", space: "life" },
    { id: "w2", quadrant: "q1", space: "work" },
    { id: "q2a", quadrant: "q2", space: "work" },
  ];
  const byId = Object.fromEntries(normalizeTasks(saved).map((t) => [t.id, t]));
  // Each group starts from scratch, so the first row of every group shares a
  // key — they are only ever compared against their own quadrant.
  assert.equal(byId.w1.orderKey, byId.l1.orderKey);
  assert.equal(byId.w1.orderKey, byId.q2a.orderKey);
  assert.ok(byId.w1.orderKey < byId.w2.orderKey);
});

test("a half-migrated list keeps the keys it already has", () => {
  const existing = orderKeyBetween(null, null);
  const saved = [
    { id: "new", quadrant: "q1", space: "work" },
    { id: "kept", quadrant: "q1", space: "work", orderKey: existing },
  ];
  const byId = Object.fromEntries(normalizeTasks(saved).map((t) => [t.id, t]));
  assert.equal(byId.kept.orderKey, existing);
  // The row without a key was listed first, so it has to sort first.
  assert.ok(byId.new.orderKey < existing);
});
