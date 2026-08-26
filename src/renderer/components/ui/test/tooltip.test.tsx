/**
 * The ported tooltip wrapper (ui/tooltip.tsx). Nothing imports it yet -- see
 * that file's comment -- so this is the only thing proving
 * `TooltipProvider`/`Tooltip`/`TooltipTrigger`/`TooltipContent` actually wire
 * together the way the port's class list assumes.
 */

import { expect, test } from "vitest";
import { mount } from "../../../react/testing.js";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../tooltip.js";

function panel() {
  return document.querySelector<HTMLElement>('[data-slot="tooltip-content"]');
}

test("closed by default: no content in the document", async () => {
  await mount(
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>hover me</TooltipTrigger>
        <TooltipContent>hint</TooltipContent>
      </Tooltip>
    </TooltipProvider>,
  );
  expect(panel()).toBeNull();
});

test("open renders the content, and it actually paints", async () => {
  await mount(
    <TooltipProvider>
      <Tooltip open>
        <TooltipTrigger>hover me</TooltipTrigger>
        <TooltipContent>hint</TooltipContent>
      </Tooltip>
    </TooltipProvider>,
  );
  const el = panel();
  expect(el).not.toBeNull();
  // offsetParent is null for position: fixed elements and would quietly lie
  // here -- CLAUDE.md's verification notes call this out by name.
  // getClientRects().length and the computed display are what actually say
  // whether something painted.
  expect(el!.getClientRects().length).toBeGreaterThan(0);
  expect(getComputedStyle(el!).display).not.toBe("none");
  expect(el!.textContent).toContain("hint");
});

test("the arrow rides along inside the content", async () => {
  await mount(
    <TooltipProvider>
      <Tooltip open>
        <TooltipTrigger>hover me</TooltipTrigger>
        <TooltipContent>hint</TooltipContent>
      </Tooltip>
    </TooltipProvider>,
  );
  expect(panel()!.querySelector("svg")).not.toBeNull();
});

test("the trigger carries its own data-slot marker", async () => {
  // Tooltip (Radix's Root) renders no DOM node of its own -- it is a context
  // provider, so `data-slot="tooltip"` on it is inert, the same as it is
  // upstream. Trigger and Content are real elements and do carry theirs.
  await mount(
    <TooltipProvider>
      <Tooltip open>
        <TooltipTrigger>hover me</TooltipTrigger>
        <TooltipContent>hint</TooltipContent>
      </Tooltip>
    </TooltipProvider>,
  );
  expect(
    document.querySelector('[data-slot="tooltip-trigger"]'),
  ).not.toBeNull();
});
