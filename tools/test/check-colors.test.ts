/**
 * The colour-leak check, checked.
 *
 * A guard that cannot fail is worse than no guard: it reports "ok" forever and
 * everyone stops looking. So this drives the audit with made-up scans rather
 * than the repository's, and asserts it says no when it should.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  audit,
  scan,
  ALLOWED,
  PALETTE_FILES,
  HEX,
} from "#tools/check-colors.js";

test("an unlisted file with a literal is an error", () => {
  const found = new Map([["src/renderer/views/matrix.tsx", 1]]);
  const { errors } = audit(found, new Map());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /no allowance/);
});

test("a listed file over its allowance is an error", () => {
  const allowed = new Map([["src/main/oauth.ts", 4]]);
  assert.equal(
    audit(new Map([["src/main/oauth.ts", 4]]), allowed).errors.length,
    0,
  );
  assert.equal(
    audit(new Map([["src/main/oauth.ts", 5]]), allowed).errors.length,
    1,
  );
});

test("a listed file under its allowance is slack, not an error", () => {
  // The ratchet only turns one way: fewer literals should say so rather than
  // pass silently, or the allowance drifts upward and stops meaning anything.
  const allowed = new Map([["src/main/oauth.ts", 4]]);
  const { errors, slack } = audit(new Map([["src/main/oauth.ts", 2]]), allowed);
  assert.equal(errors.length, 0);
  assert.deepEqual(slack, [["src/main/oauth.ts", 2, 4]]);
});

test("a listed file with none left is slack too", () => {
  const { slack } = audit(new Map(), new Map([["src/main/oauth.ts", 4]]));
  assert.deepEqual(slack, [["src/main/oauth.ts", 0, 4]]);
});

test("the pattern matches the shapes a stylesheet writes", () => {
  const hits = (s: string) => s.match(new RegExp(HEX.source, "g")) ?? [];
  assert.deepEqual(hits("color: #fff"), ["#fff"]);
  assert.deepEqual(hits("border-[#dadce0]"), ["#dadce0"]);
  assert.deepEqual(hits("#a8302a1a and #7c43c840"), ["#a8302a1a", "#7c43c840"]);
  // Not every # is a colour. An id selector and a bare hash are not.
  assert.deepEqual(hits("#memoPanel"), []);
  assert.deepEqual(hits("issue #62"), []);
});

test("the palette's own files are not scanned", () => {
  // They are the colours. Counting them would mean allowing thirty-odd
  // literals in the one file where a literal is the point.
  for (const file of PALETTE_FILES) {
    assert.equal(scan().has(file), false, `${file} should be exempt`);
  }
});

test("the repository passes its own allowance", () => {
  const { errors } = audit();
  assert.deepEqual(errors, []);
});

test("every allowance names a file that exists", () => {
  // An allowance for a deleted or renamed file is a hole nobody sees: the
  // check goes on passing and the reason it was written for is gone.
  const found = scan();
  const stale = [...ALLOWED.keys()].filter((f) => !found.has(f));
  assert.deepEqual(
    stale,
    [],
    `these allowances have nothing left to allow: ${stale.join(", ")}`,
  );
});
