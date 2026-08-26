/**
 * The chip, and the popover it opens.
 *
 * Two things had to survive the native `<input type="date">` going away: the
 * shape of what leaves onChange, and a way to clear a date that is no longer
 * drawn by the OS. Both are checked here rather than assumed.
 */

import { expect, test, vi } from "vitest";
import { find, mount } from "../../react/testing.js";
import { DueChip } from "../due-chip.js";

/** Today's day cell, however the calendar is currently laid out. */
const todayButton = () =>
  document.querySelector<HTMLButtonElement>('[data-today="true"] button');

test("an unset chip shows the calendar icon, not a date", async () => {
  await mount(<DueChip value={null} onChange={vi.fn()} />);
  expect(find(".face").querySelector("svg")).not.toBeNull();
  expect(find(".face").textContent).toBe("");
});

test("a chip with a date renders its face", async () => {
  await mount(<DueChip value="2026-08-30" onChange={vi.fn()} />);
  // formatDue's exact wording is core.ts's concern (see core/test/dates.test.ts);
  // this only checks that a date turns into text instead of the icon.
  expect(find(".face").querySelector("svg")).toBeNull();
  expect(find(".face").textContent).not.toBe("");
});

test("clicking the chip opens a calendar", async () => {
  const { flush: run } = await mount(
    <DueChip value={null} onChange={vi.fn()} />,
  );
  expect(document.querySelector(".due-calendar")).toBeNull();
  await run(() => find(".due").click());
  expect(document.querySelector(".due-calendar")).not.toBeNull();
});

test("picking a day emits 'YYYY-MM-DD' and closes the calendar", async () => {
  const onChange = vi.fn();
  const { flush: run } = await mount(
    <DueChip value={null} onChange={onChange} />,
  );
  await run(() => find(".due").click());
  const button = todayButton();
  expect(button).not.toBeNull();
  await run(() => button!.click());
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(
    expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
  );
  expect(document.querySelector(".due-calendar")).toBeNull();
});

test("the clear button in the calendar emits null, the same as a cleared native input used to", async () => {
  const onChange = vi.fn();
  const { flush: run } = await mount(
    <DueChip value="2026-08-30" onChange={onChange} />,
  );
  await run(() => find(".due").click());
  const clear = find<HTMLButtonElement>(".due-calendar-clear");
  expect(clear.disabled).toBe(false);
  await run(() => clear.click());
  expect(onChange).toHaveBeenCalledWith(null);
  expect(document.querySelector(".due-calendar")).toBeNull();
});

test("the clear button is disabled when there is nothing to clear", async () => {
  const { flush: run } = await mount(
    <DueChip value={null} onChange={vi.fn()} />,
  );
  await run(() => find(".due").click());
  expect(find<HTMLButtonElement>(".due-calendar-clear").disabled).toBe(true);
});

test("the trigger stays visible while its calendar is open", async () => {
  // A row's chip fades out except on hover or focus (see due-chip.tsx). Radix
  // moves focus into the portalled popover on open, which is outside the
  // chip's own subtree -- so :focus-within alone would fade the chip out from
  // under an open calendar. `open` state exists in the component for this.
  const { flush: run } = await mount(
    <DueChip value={null} onChange={vi.fn()} />,
  );
  expect(find(".due").classList.contains("opacity-100")).toBe(false);
  await run(() => find(".due").click());
  expect(find(".due").classList.contains("opacity-100")).toBe(true);
});
