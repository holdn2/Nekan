/**
 * The ported `ui/textarea.tsx`.
 *
 * Same shape of coverage as ui/input.tsx's test: the port renders the real
 * element with its own attributes intact, disabled reaches the DOM node,
 * and the classes this file substituted for upstream's tokens/spacing/radius
 * are ones Tailwind actually compiled (see `compiled-css.tsx` for why a
 * className string alone cannot prove that).
 */

import { expect, test, vi } from "vitest";
import { find, mount } from "../../../react/testing.js";
import { classCompiled } from "./compiled-css.js";
import { Textarea } from "../textarea.js";

test("renders a textarea carrying data-slot", async () => {
  await mount(<Textarea id="t" placeholder="notes" />);
  const el = find<HTMLTextAreaElement>("#t");
  expect(el.tagName).toBe("TEXTAREA");
  expect(el.getAttribute("data-slot")).toBe("textarea");
  expect(el.placeholder).toBe("notes");
});

test("typing updates the value like any other controlled textarea", async () => {
  const onChange = vi.fn();
  const { flush } = await mount(
    <Textarea id="t" value="a" onChange={onChange} />,
  );
  const el = find<HTMLTextAreaElement>("#t");
  expect(el.value).toBe("a");
  // See ui/input.tsx's test for why the value has to move through the
  // native setter before dispatching -- React's own value tracker otherwise
  // sees no change and never enqueues onChange.
  const setValue = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  )!.set!;
  await flush(() => {
    setValue.call(el, "b");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(onChange).toHaveBeenCalled();
});

test("disabled reaches the real element, and dims it rather than hiding it", async () => {
  await mount(<Textarea id="t" disabled />);
  const el = find<HTMLTextAreaElement>("#t");
  expect(el.disabled).toBe(true);
  expect(el.className).toContain("disabled:opacity-50");
});

test("a custom className merges rather than replaces the port's own", async () => {
  await mount(<Textarea id="t" className="w-1/2" />);
  const classes = find("#t").className;
  expect(classes).toContain("w-1/2");
  expect(classes).toContain("bg-input-bg");
});

test("the classes this port asks for are ones Tailwind actually compiled", async () => {
  await mount(<Textarea id="t" />);
  // Membership, not substring: "border-line" is a prefix of
  // "border-line-strong", so a toContain on the whole attribute would pass on
  // a class the port no longer asks for.
  const classes = find("#t").className.split(/\s+/);
  for (const cls of [
    "bg-input-bg",
    "border-line-strong",
    "rounded-panel",
    "px-lg",
    "py-md",
    "text-md",
    "min-h-[64px]",
    "field-sizing-content",
    "focus-visible:border-accent",
    "focus-visible:ring-accent-soft",
    "placeholder:text-faint",
    "aria-invalid:ring-danger/20",
  ]) {
    expect(classes).toContain(cls);
    expect(classCompiled(cls)).toBe(true);
  }
});
