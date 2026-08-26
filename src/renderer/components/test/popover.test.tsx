/**
 * The ported popover wrapper (ui/popover.tsx).
 *
 * Nothing imports this component yet -- see its file comment -- so this is
 * the only thing proving `Popover`/`PopoverTrigger`/`PopoverContent` actually
 * wire together the way the port's class list assumes. `due-chip.test.tsx`
 * and `due-calendar.test.tsx` cover the *other* popover in this app (the one
 * `due-calendar.tsx` builds straight from `@radix-ui/react-popover`, which
 * this file does not touch).
 */

import { expect, test } from "vitest";
import { mount } from "../../react/testing.js";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover.js";

function panel() {
  return document.querySelector<HTMLElement>('[data-slot="popover-content"]');
}

test("closed by default: no content in the document", async () => {
  await mount(
    <Popover>
      <PopoverTrigger>open</PopoverTrigger>
      <PopoverContent>hello</PopoverContent>
    </Popover>,
  );
  expect(panel()).toBeNull();
});

test("open renders the content, and it actually paints", async () => {
  await mount(
    <Popover open>
      <PopoverTrigger>open</PopoverTrigger>
      <PopoverContent>hello</PopoverContent>
    </Popover>,
  );
  const el = panel();
  expect(el).not.toBeNull();
  // offsetParent is null for position: fixed elements and would quietly lie
  // here -- CLAUDE.md's verification notes call this out by name.
  // getClientRects().length and the computed display are what actually say
  // whether something painted.
  expect(el!.getClientRects().length).toBeGreaterThan(0);
  expect(getComputedStyle(el!).display).not.toBe("none");
  expect(el!.textContent).toBe("hello");
});

test("clicking the trigger opens it, uncontrolled", async () => {
  const { flush: run } = await mount(
    <Popover>
      <PopoverTrigger>open</PopoverTrigger>
      <PopoverContent>hello</PopoverContent>
    </Popover>,
  );
  expect(panel()).toBeNull();
  await run(() =>
    document
      .querySelector<HTMLElement>('[data-slot="popover-trigger"]')!
      .click(),
  );
  expect(panel()).not.toBeNull();
});

test("closing again removes the content from the document", async () => {
  const { flush: run } = await mount(
    <Popover>
      <PopoverTrigger>open</PopoverTrigger>
      <PopoverContent>hello</PopoverContent>
    </Popover>,
  );
  const trigger = () =>
    document.querySelector<HTMLElement>('[data-slot="popover-trigger"]')!;
  await run(() => trigger().click());
  expect(panel()).not.toBeNull();
  await run(() => trigger().click());
  expect(panel()).toBeNull();
});
