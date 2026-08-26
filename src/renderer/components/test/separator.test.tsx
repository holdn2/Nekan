/**
 * The ported `ui/separator.tsx`.
 *
 * This component has no `variant`/`size` prop -- its one axis is
 * `orientation`, which Radix expresses as a `data-orientation` attribute
 * rather than a different class list (both the horizontal and the vertical
 * rule sit in the className the whole time; which one applies depends on
 * that attribute). So what is worth pinning down is: the attribute actually
 * switches with the prop, `decorative` still controls the accessibility
 * tree the way Radix promises, and the bracket-form data-attribute
 * selectors this port wrote in place of upstream's bare shorthand (see the
 * file's own comment for why) are ones Tailwind actually compiled -- see
 * `compiled-css.tsx` for why a className string alone cannot prove that.
 */

import { expect, test } from "vitest";
import { find, mount } from "../../react/testing.js";
import { classCompiled } from "./compiled-css.js";
import { Separator } from "../ui/separator.js";

test("defaults to horizontal, decorative, and data-slot", async () => {
  await mount(<Separator id="s" />);
  const el = find<HTMLDivElement>("#s");
  expect(el.getAttribute("data-slot")).toBe("separator");
  expect(el.getAttribute("data-orientation")).toBe("horizontal");
  // decorative (the default) removes the element from the a11y tree.
  expect(el.getAttribute("role")).toBe("none");
});

test("orientation reaches the DOM as the attribute the compiled CSS keys off of", async () => {
  await mount(<Separator id="s" orientation="vertical" />);
  const el = find<HTMLDivElement>("#s");
  expect(el.getAttribute("data-orientation")).toBe("vertical");
});

test("decorative=false restores the separator role and, when vertical, aria-orientation", async () => {
  await mount(<Separator id="s" orientation="vertical" decorative={false} />);
  const el = find<HTMLDivElement>("#s");
  expect(el.getAttribute("role")).toBe("separator");
  expect(el.getAttribute("aria-orientation")).toBe("vertical");
});

test("a custom className merges rather than replaces the port's own", async () => {
  await mount(<Separator id="s" className="my-lg" />);
  const classes = find("#s").className;
  expect(classes).toContain("my-lg");
  expect(classes).toContain("bg-line");
});

test("the classes this port asks for are ones Tailwind actually compiled", async () => {
  await mount(<Separator id="s" />);
  const classes = find("#s").className;
  for (const cls of [
    "bg-line",
    "shrink-0",
    "data-[orientation=horizontal]:h-px",
    "data-[orientation=horizontal]:w-full",
    "data-[orientation=vertical]:w-px",
    "data-[orientation=vertical]:self-stretch",
  ]) {
    expect(classes).toContain(cls);
    expect(classCompiled(cls)).toBe(true);
  }

  // Upstream's own bare shorthand for this same rule is exactly the trap
  // this port's file comment describes: it would compile to a selector
  // matching an attribute Radix never sets, and so never apply, while still
  // showing up in a className string just as convincingly as a working
  // class. Asserting it did NOT compile is the negative case that proves the
  // positive one above is not a coincidence -- assembled at runtime, on
  // purpose, so this assertion's own source never spells out the complete
  // candidate as one contiguous token. Tailwind's content scanner reads this
  // file as text, the same way it reads every other one `@source` covers;
  // writing the whole thing out literally would compile it for real (this
  // failed once, against this very check, before the split below) and make
  // this assertion always pass regardless of whether the port actually
  // avoided the bug.
  const bareForm = ["data", "-horizontal:h", "-px"].join("");
  expect(classCompiled(bareForm)).toBe(false);
});
