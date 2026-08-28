/**
 * The add box, now that its two controls are ported primitives.
 *
 * What is pinned here is the half of that adoption nothing else can see. The
 * primitives arrive carrying upstream's sizes and upstream's palette, and this
 * form overrides both -- but an override only works because `cn()` merges, and
 * a merge that stops working is silent: the class is still in the attribute,
 * the app still builds, and the add box quietly grows to 16px text in a list
 * of 13px rows.
 *
 * So these cases assert on the *merged* class list: the override present and
 * the class it displaced gone. There is no cascade in happy-dom to measure
 * instead, and a computed style would not answer the same question anyway --
 * it cannot tell "the override won" from "the override happened to be emitted
 * later". The pixels are checked in the running app; see the notes on this
 * change.
 */

import { expect, test, vi } from "vitest";
import { setLanguage } from "../../i18n.js";
import { find, mount } from "../../react/testing.js";
import { AddForm } from "../add-form.js";

const classes = (el: Element) => el.className.split(/\s+/);

const draw = async () => {
  setLanguage("en");
  (window as unknown as { api: { save: unknown } }).api = { save: vi.fn() };
  await mount(
    <AddForm place="q1" placeholderKey="matrix.addPlaceholder" withDue />,
  );
};

test("the text box is ui/input, wearing this app's size and palette", async () => {
  await draw();
  const input = find<HTMLInputElement>(
    'form[data-add="q1"] input[type="text"]',
  );

  // It really is the primitive and not a hand-rolled <input>.
  expect(input.dataset.slot).toBe("input");
  expect(classes(input)).toContain("disabled:opacity-50");
  // Size: rows are 13px, so the box a row is written in is too.
  expect(classes(input)).toContain("text-md");
  expect(classes(input)).not.toContain("text-xl");

  // The box itself is the wrapper's, because the due chip sits inside it. The
  // field must not draw a second border, background or focus ring on top --
  // an outline inside an outline is exactly what moving the chip in removed.
  expect(classes(input)).toContain("border-0");
  expect(classes(input)).toContain("bg-transparent");
  expect(classes(input)).toContain("focus-visible:ring-0");
});

test("the box is the wrapper, and the chip is inside it", async () => {
  await draw();
  const input = find<HTMLInputElement>(
    'form[data-add="q1"] input[type="text"]',
  );
  const box = input.parentElement!;
  const chip = find('form[data-add="q1"] .duebox');

  // One box holding both: this is the arrangement, and the assertion is that
  // the chip is a descendant rather than a sibling. Sitting beside the field
  // is what made everything to its right move when a date was chosen.
  expect(box.contains(chip)).toBe(true);
  // 32px tall, 8px corners, the stronger line, and it focuses to the accent
  // when anything inside it does.
  expect(classes(box)).toContain("h-6xl");
  expect(classes(box)).toContain("rounded-md");
  expect(classes(box)).toContain("border-line-strong");
  expect(classes(box)).toContain("focus-within:border-accent");
  expect(classes(box)).toContain("focus-within:ring-accent-soft");

  // And the submit is outside it, on its own, with all four corners.
  const submit = find('form[data-add="q1"] button[type="submit"]');
  expect(box.contains(submit)).toBe(false);
  expect(classes(submit)).not.toContain("rounded-l-none");
});

test("the submit is ui/button, sized to the chip it stands next to", async () => {
  await draw();
  const button = find<HTMLButtonElement>(
    'form[data-add="q1"] button[type="submit"]',
  );

  expect(button.dataset.slot).toBe("button");
  expect(button.dataset.variant).toBe("outline");
  expect(button.dataset.size).toBe("icon-sm");

  // icon-sm is 28px. 30 matches the box beside it, which states 32 and draws
  // a 1px border on each side -- the submit sits level with its inner edge.
  expect(classes(button)).toContain("size-[30px]");
  expect(classes(button)).not.toContain("size-[28px]");

  // react/icons.tsx decides icon sizes, and PlusIcon is 12px. ui/button would
  // otherwise draw it at 14 -- by CSS, which beats the SVG's own attribute.
  expect(classes(button)).toContain(
    "[&_svg:not([class*='size-'])]:size-[12px]",
  );
  expect(classes(button)).not.toContain(
    "[&_svg:not([class*='size-'])]:size-2xl",
  );

  // There is no preflight here, so a bare <button> keeps the browser's fill.
  // `outline` sets one; this form replaces it rather than leaving it unset.
  expect(classes(button)).toContain("bg-panel-2");
  expect(classes(button)).not.toContain("bg-panel");
  expect(classes(button)).not.toContain("bg-transparent");

  // And the plus is still in it.
  expect(button.querySelector("svg")).not.toBeNull();
});

test("the row is centred, so the 30px chip does not hang off the 32px box", async () => {
  await draw();
  // Before ui/input the text box had no height of its own and stretched to
  // whatever the chip was. It states 32 now, so without this the chip and the
  // submit would sit against the top edge.
  expect(classes(find('form[data-add="q1"]'))).toContain("items-center");
});
