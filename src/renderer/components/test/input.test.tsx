/**
 * The ported `ui/input.tsx`.
 *
 * Mostly a pass-through to `<input>`, so what is worth pinning down is the
 * port's own work: the `type` prop still lands on the DOM node, disabled
 * still disables the real element, and the classes this file substituted for
 * upstream's tokens/spacing/radius are ones Tailwind actually compiled (see
 * `compiled-css.tsx` for why a className string alone cannot prove that).
 */

import { expect, test, vi } from "vitest";
import { find, mount } from "../../react/testing.js";
import { classCompiled } from "./compiled-css.js";
import { Input } from "../ui/input.js";

test("renders an input carrying data-slot and the given type", async () => {
  await mount(<Input id="i" type="email" placeholder="you@example.com" />);
  const el = find<HTMLInputElement>("#i");
  expect(el.tagName).toBe("INPUT");
  expect(el.type).toBe("email");
  expect(el.getAttribute("data-slot")).toBe("input");
  expect(el.placeholder).toBe("you@example.com");
});

test("typing updates the value like any other controlled input", async () => {
  const onChange = vi.fn();
  const { flush } = await mount(<Input id="i" value="a" onChange={onChange} />);
  const el = find<HTMLInputElement>("#i");
  expect(el.value).toBe("a");
  // React tracks the DOM value itself and only enqueues onChange when a
  // native "input" event arrives with a value different from what it last
  // saw -- so the native setter has to move the value before the event
  // fires, the same way an actual keystroke would; setting `el.value`
  // through the wrapped React-instrumented property and dispatching on top
  // of it leaves the tracker seeing no change, and onChange never fires.
  const setValue = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )!.set!;
  await flush(() => {
    setValue.call(el, "b");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(onChange).toHaveBeenCalled();
});

test("disabled reaches the real element, and dims it rather than hiding it", async () => {
  await mount(<Input id="i" disabled />);
  const el = find<HTMLInputElement>("#i");
  expect(el.disabled).toBe(true);
  expect(el.className).toContain("disabled:opacity-50");
});

test("aria-invalid switches on the same element's own invalid styling", async () => {
  await mount(<Input id="i" aria-invalid="true" />);
  const el = find<HTMLInputElement>("#i");
  expect(el.getAttribute("aria-invalid")).toBe("true");
  expect(el.className).toContain("aria-invalid:border-danger");
});

test("a custom className merges rather than replaces the port's own", async () => {
  await mount(<Input id="i" className="w-1/2" />);
  const classes = find("#i").className;
  expect(classes).toContain("w-1/2");
  expect(classes).toContain("bg-input-bg");
});

test("the classes this port asks for are ones Tailwind actually compiled", async () => {
  await mount(<Input id="i" />);
  const classes = find("#i").className;
  for (const cls of [
    "bg-input-bg",
    "border-line",
    "h-6xl",
    "rounded-panel",
    "px-lg",
    "py-xs",
    "text-xl",
    "file:h-5xl",
    "focus-visible:border-line-strong",
    "aria-invalid:ring-danger/20",
  ]) {
    expect(classes).toContain(cls);
    expect(classCompiled(cls)).toBe(true);
  }
});
