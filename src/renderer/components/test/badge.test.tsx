/**
 * The ported `ui/badge.tsx`.
 *
 * Three things worth pinning down for a port: it renders at all, its
 * `variant` prop actually changes which classes come out (a `cva` call with
 * every branch collapsed to the same string would still "work"), and those
 * classes are ones Tailwind actually compiled rather than a token this port
 * misspelled or a spacing number this app's scale does not define -- see
 * `compiled-css.tsx` for why a className string alone cannot prove that.
 */

import { expect, test } from "vitest";
import { find, mount } from "../../react/testing.js";
import { classCompiled } from "./compiled-css.js";
import { Badge } from "../ui/badge.js";

test("renders as a span carrying data-slot and data-variant", async () => {
  await mount(<Badge id="b">todo</Badge>);
  const el = find<HTMLSpanElement>("#b");
  expect(el.tagName).toBe("SPAN");
  expect(el.getAttribute("data-slot")).toBe("badge");
  expect(el.getAttribute("data-variant")).toBe("default");
  expect(el.textContent).toBe("todo");
});

test("each variant asks for a different background", async () => {
  const variants = [
    "default",
    "secondary",
    "destructive",
    "outline",
    "ghost",
    "link",
  ] as const;

  const classNames = new Map<string, string>();
  for (const variant of variants) {
    await mount(<Badge id="b" variant={variant} />);
    classNames.set(variant, find("#b").className);
  }

  // No two variants should produce the same class string -- a cva branch
  // that fell through to the default would show up here as a collision.
  expect(new Set(classNames.values()).size).toBe(variants.length);
});

test("a custom className overrides the variant's background rather than losing the merge", async () => {
  await mount(<Badge id="b" variant="default" className="bg-panel-2" />);
  const classes = find("#b").className;
  expect(classes).toContain("bg-panel-2");
  expect(classes).not.toContain("bg-accent");
});

test("the classes this port asks for are ones Tailwind actually compiled", async () => {
  // One representative class per adaptation this port made: a named spacing
  // step (h-4xl), the pill radius, a colour token this app defines
  // (bg-panel-3, for the secondary variant), the danger opacity shorthand
  // (bg-danger/10), and the important-modifier icon rule. Checked against
  // the mounted badge's own className, not just the global stylesheet --
  // `px-md` alone compiles regardless of what this file asks for (a dozen
  // other components already use it), so only checking `classCompiled`
  // without also checking membership here would not catch this port
  // asking for the wrong class.
  await mount(<Badge id="b" />);
  const classes = find("#b").className;
  for (const cls of [
    "h-4xl",
    "rounded-pill",
    "gap-xs",
    "px-md",
    "py-2xs",
    "[&>svg]:size-xl!",
  ]) {
    expect(classes).toContain(cls);
    expect(classCompiled(cls)).toBe(true);
  }

  await mount(<Badge id="secondary" variant="secondary" />);
  expect(find("#secondary").className).toContain("bg-panel-3");
  expect(classCompiled("bg-panel-3")).toBe(true);

  await mount(<Badge id="destructive" variant="destructive" />);
  expect(find("#destructive").className).toContain("bg-danger/10");
  expect(classCompiled("bg-danger/10")).toBe(true);
});
