/**
 * What has to stay true now that this button is a wrapper over the ported
 * `Button` rather than its own utilities.
 *
 * Both tests guard the same mistake from two sides: reaching for `Button`'s
 * own `destructive` variant because the prop here is called `danger`. That
 * variant carries a red fill at rest, and the whole point of this one is that
 * 영구 삭제 is only red once you are pointing at it.
 */

import { expect, test, vi } from "vitest";

import { GhostButton } from "../ghost-button.js";
import { mount } from "../../react/testing.js";

async function render(danger?: boolean) {
  const { container } = await mount(
    <GhostButton danger={danger} onClick={() => {}}>
      비우기
    </GhostButton>,
  );
  return container.querySelector("button")!;
}

test("it goes through the ported Button rather than drawing its own", async () => {
  const button = await render();
  // data-slot is the port's own marker; if this stops being set, the button is
  // no longer picking up the shape the rest of the app is moving to.
  expect(button.dataset.slot).toBe("button");
  expect(button.dataset.variant).toBe("outline");
});

test("the border stays the strong one", async () => {
  const button = await render();
  // `outline` draws its edge in `line`, which measured on a panel background
  // is nearly the panel's own colour. The edge is the only thing saying this
  // is a button, so it is pinned a step darker here.
  expect(button.className).toContain("border-line-strong");
});

test("danger is red on hover and nowhere else", async () => {
  const button = await render(true);
  const classes = button.className.split(/\s+/);
  const red = classes.filter((c) => /danger/.test(c));
  expect(red.length).toBeGreaterThan(0);
  // Every one of them has to be behind a state variant. A bare `bg-danger` or
  // `text-danger` here would mean the button sits there red.
  expect(red.filter((c) => !c.includes(":"))).toEqual([]);
});

test("without danger nothing turns red on hover", async () => {
  const button = await render();
  const classes = button.className.split(/\s+/);
  // Not "no red anywhere": the ported Button's base classes carry
  // aria-invalid:ring-danger and aria-invalid:border-danger, which only ever
  // paint on a field the form has marked invalid. Hover is the state this
  // component owns, and an ordinary GhostButton must not use it for red.
  expect(
    classes.filter((c) => c.startsWith("hover:") && /danger/.test(c)),
  ).toEqual([]);
});

test("it still calls back when pressed", async () => {
  const onClick = vi.fn();
  const { container, flush } = await mount(
    <GhostButton onClick={onClick}>비우기</GhostButton>,
  );
  await flush(() => container.querySelector("button")!.click());
  expect(onClick).toHaveBeenCalledOnce();
});
