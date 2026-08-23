/**
 * The keys that decide the order of rows inside one quadrant.
 *
 * Not array position: a move writes one row rather than the whole list. Keys
 * are compared as strings and only ever against keys from the same
 * (quadrant, space) group -- comparing across groups is meaningless.
 */

import type { Task } from "../types.js";

/**
 * Where a task sits inside its quadrant is a string, not an array position.
 *
 * The array cannot carry it once the list is shared between devices: a server
 * hands back a *set* of rows, and two devices that each reordered locally leave
 * nothing to merge from. A key that sorts lexicographically survives that,
 * and inserting between two neighbours only ever writes the row that moved —
 * renumbering the whole quadrant would make every move a full-list write.
 *
 * Keys are digit strings read as the fraction after an implied "0.", so there
 * is always room between any two of them. The alphabet is ASCII-ordered, which
 * is what lets a plain `<` on the strings be the comparison.
 */
const ORDER_DIGITS =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ORDER_BASE = ORDER_DIGITS.length;

/**
 * The next key after `a`, for a row going on the end of a list.
 *
 * Stepping one digit rather than halving the distance to the end. Both are
 * correct — appending only needs *some* key greater than `a` — but halving
 * runs out fast: from the middle there are five steps before the digit is
 * exhausted (31, 47, 55, 59, 61), so a list grew a character every five rows.
 * A thousand of them carried 200-character keys and orderKey was a quarter of
 * data.json, all of it also going over the wire on every sync. Stepping gets
 * 61 rows per character.
 *
 * The cost is real but the right way round: consecutive keys are now adjacent,
 * so a drop between two of them has to add a character where before there was
 * room to split. Appending happens on every new task; inserting happens on a
 * drag.
 *
 * The empty case keeps the old midpoint, and deliberately: that is the first
 * key in a quadrant, and starting it in the middle is what leaves room to
 * drop a row *above* it later. Deeper positions start at 1 instead — nothing
 * is ever inserted before them, because they only exist as the tail of a key
 * that already sorts after everything.
 */
function orderKeyAfter(a: string): string {
  if (!a) return ORDER_DIGITS[Math.round(ORDER_BASE / 2)];

  // Walk past the digits with nothing left to give. Anything before the first
  // one that can still step is dropped, which keeps the key as short as the
  // ordering allows: after "Vz" the next key is "W", not "Vz1".
  let at = 0;
  while (at < a.length && ORDER_DIGITS.indexOf(a[at]) === ORDER_BASE - 1) {
    at += 1;
  }
  // Every digit was the last one. One more place, at its lowest usable digit —
  // never 0, which isOrderKey rejects for having no room in front of it.
  if (at === a.length) return a + ORDER_DIGITS[1];
  return a.slice(0, at) + ORDER_DIGITS[ORDER_DIGITS.indexOf(a[at]) + 1];
}

/**
 * A key strictly between `a` and `b`, where '' is the start of the list and
 * null is the end. Walks past the common prefix first, then splits the first
 * digit that differs; when those digits are neighbours there is no room at this
 * position, so it keeps `a`'s digit and goes one place deeper.
 */
function orderMidpoint(a: string, b: string | null): string {
  // No `b` is not a midpoint at all — see orderKeyAfter for why the two cases
  // want different arithmetic.
  if (b === null) return orderKeyAfter(a);

  let n = 0;
  while ((a[n] || "0") === b[n]) n += 1;
  if (n > 0) return b.slice(0, n) + orderMidpoint(a.slice(n), b.slice(n));

  const digitA = a ? ORDER_DIGITS.indexOf(a[0]) : 0;
  const digitB = ORDER_DIGITS.indexOf(b[0]);

  if (digitB - digitA > 1) {
    return ORDER_DIGITS[Math.round(0.5 * (digitA + digitB))];
  }
  // The digits are adjacent. `b` has more to give if it is longer than one
  // digit; otherwise the room has to come from extending `a`. Anything after
  // `a` that keeps a's leading digit is still before `b`, so the tail is the
  // same "next key" problem.
  if (b.length > 1) return b.slice(0, 1);
  return ORDER_DIGITS[digitA] + orderKeyAfter(a.slice(1));
}

/**
 * Is this a key this file could have produced?
 *
 * Being a non-empty string is not enough. Two shapes are unusable:
 *   - a character outside ORDER_DIGITS, which sorts against real keys by
 *     accident rather than by the alphabet's order;
 *   - a trailing lowest digit. There is no room in front of such a key —
 *     `orderKeyBetween(null, '0')` can only return `'00…'`, and that sorts
 *     *after* `'0'`, so a drop above the row would land below it.
 *
 * Neither can come out of orderMidpoint(); both can come from a hand-edited
 * file or, later, from another device. A row carrying one is treated as having
 * no key at all, which is what makes normalizeTasks() replace it.
 */
export function isOrderKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value !== "" &&
    value[value.length - 1] !== ORDER_DIGITS[0] &&
    [...value].every((digit) => ORDER_DIGITS.includes(digit))
  );
}

/**
 * The order key for a row dropped between `before` and `after`. Either side may
 * be missing: no `before` means the head of the list, no `after` means the tail.
 *
 * A neighbour that is not a usable key — or a pair already out of sequence —
 * would make the midpoint meaningless, so the broken side is dropped rather
 * than thrown on: a bad key in the file must not stop a drag from completing.
 */
export function orderKeyBetween(
  before?: string | null,
  after?: string | null,
): string {
  const a = isOrderKey(before) ? before : "";
  const b = isOrderKey(after) ? after : null;
  if (b !== null && a >= b) return orderMidpoint("", b);
  return orderMidpoint(a, b);
}

/** Sort comparator for rows of one quadrant; ties break on id so it is total. */
export function compareOrder(a: Partial<Task>, b: Partial<Task>): number {
  const ka = typeof a?.orderKey === "string" ? a.orderKey : "";
  const kb = typeof b?.orderKey === "string" ? b.orderKey : "";
  if (ka !== kb) return ka < kb ? -1 : 1;
  const ia = String(a?.id);
  const ib = String(b?.id);
  if (ia === ib) return 0;
  return ia < ib ? -1 : 1;
}

/** Keys only have to be unique within one quadrant of one board. */
function orderGroupOf(task: Partial<Task>): string {
  return `${task.quadrant}\u0000${task.space === null ? "" : task.space}`;
}

/** Exported for tasks.ts, which decides whether a stored row kept one. */
export const hasOrderKey = (t: Partial<Task> | null | undefined) =>
  isOrderKey(t?.orderKey);

/**
 * Give a key to every row saved before the field existed, in the array order
 * the old builds displayed — that array order *is* the user's ordering, and
 * losing it would shuffle their quadrants on first launch.
 *
 * Rows that already have a key keep it, so a file that is half migrated (a sync
 * could deliver one) fills only its gaps: each missing row is placed between
 * the previous key in its group and the next existing one.
 */
/** Exported for tasks.ts: every row a normalise produces has to have a key. */
export function assignOrderKeys(list: Task[]): Task[] {
  if (list.every(hasOrderKey)) return list;

  // The nearest existing key *after* each index, within the same group.
  const following = new Array(list.length).fill(null);
  const seen = new Map();
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const group = orderGroupOf(list[i]);
    following[i] = seen.has(group) ? seen.get(group) : null;
    if (hasOrderKey(list[i])) seen.set(group, list[i].orderKey);
  }

  const previous = new Map();
  list.forEach((task: Task, i: number) => {
    const group = orderGroupOf(task);
    if (hasOrderKey(task)) {
      previous.set(group, task.orderKey);
      return;
    }
    const key = orderKeyBetween(previous.get(group) || null, following[i]);
    task.orderKey = key;
    previous.set(group, key);
  });
  return list;
}
