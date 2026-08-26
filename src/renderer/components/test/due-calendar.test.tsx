/**
 * The calendar itself, mounted directly rather than through the chip.
 *
 * Popover.Content needs a Popover.Root/Trigger ancestor to read its
 * positioning context from, so these tests build the smallest wrapper that
 * gives it one -- due-chip.test.tsx covers the trigger-to-calendar wiring.
 */

import { expect, test, vi } from "vitest";
import * as Popover from "@radix-ui/react-popover";
import { mount } from "../../react/testing.js";
import { setLanguage } from "../../i18n.js";
import { DueCalendar } from "../due-calendar.js";

function open(value: string | null, onChange = vi.fn()) {
  return mount(
    <Popover.Root open>
      <Popover.Trigger>open</Popover.Trigger>
      <DueCalendar value={value} onChange={onChange} onClose={vi.fn()} />
    </Popover.Root>,
  );
}

test("the month and weekday names follow the app language, from Intl/date-fns rather than the catalogue", async () => {
  setLanguage("ko");
  await open("2026-08-30");
  const koCaption = document.querySelector(".due-calendar")!.textContent!;
  expect(koCaption).toMatch(/8월/);

  setLanguage("en");
  await open("2026-08-30");
  const enCaption = document.querySelector(".due-calendar")!.textContent!;
  expect(enCaption).toMatch(/August/);

  setLanguage("en"); // leave it as the tests found it
});

test("the picked day is marked selected on the grid", async () => {
  await open("2026-08-30");
  const selected = document.querySelector('[data-selected="true"]');
  expect(selected).not.toBeNull();
});

test("a null value leaves nothing marked selected", async () => {
  await open(null);
  expect(document.querySelector('[data-selected="true"]')).toBeNull();
});
