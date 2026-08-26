/**
 * Proof that a class name is not just a string sitting in an attribute --
 * Tailwind actually generated a rule for it.
 *
 * happy-dom (this repo's vitest environment) applies no cascade at all, so
 * asserting a className string only proves a component *wrote* the class,
 * never that it *compiles*. A misspelled token, or a spacing number this
 * app's scale does not define (`p-2`, `size-4`, ...), shows up in the
 * attribute exactly the same way a real one does and would still pass a
 * naive `toContain` check -- the trap the ui/ port's task explicitly calls
 * out. Reading the actual build output, provided by
 * `vitest.global-setup.mts` (see its own comment for why this file cannot
 * just `readFileSync` the CSS itself), is the only way to close that gap
 * without a real browser.
 */

import { inject } from "vitest";

/**
 * Tailwind's own escaping when a class name becomes a CSS selector: every
 * character a bare selector cannot carry (`:`, `[`, `]`, `/`, `!`, `=`, `.`,
 * `&`, `>`, a space, ...) gets a backslash in front of it -- anything outside
 * `[a-zA-Z0-9_-]`. Verified against this build's own output:
 * `data-[orientation=horizontal]:h-px` comes out as
 * `.data-\[orientation\=horizontal\]\:h-px`, `bg-danger/10` as
 * `.bg-danger\/10`, and `[&>svg]:size-xl!` as `.\[\&\>svg\]\:size-xl\!`.
 */
function escapeForSelector(className: string): string {
  return className.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}

/**
 * Has Tailwind emitted a rule whose selector starts with this exact utility
 * class? Checks that the character right after the match cannot be part of
 * the same identifier -- so that e.g. asking for `rounded-md` cannot be
 * satisfied by some unrelated `rounded-md-ish` class that merely starts the
 * same way. Anything else that can follow a class in a real selector is
 * fair game: `{` (nothing else in the rule), `:`/`[` (a pseudo-class or
 * attribute selector chained on), another escaped character, or a
 * combinator introducing the next simple selector (`>`, `~`, `+`, a space)
 * -- `[&>svg]:size-xl!` compiles to `.\[\&\>svg\]\:size-xl\!>svg{...}`, with
 * the child combinator landing right there.
 */
export function classCompiled(className: string): boolean {
  const css = inject("builtCss");
  const needle = `.${escapeForSelector(className)}`;
  const at = css.indexOf(needle);
  if (at === -1) return false;
  const after = css[at + needle.length];
  return after === undefined || !/[a-zA-Z0-9_-]/.test(after);
}
