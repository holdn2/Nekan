/**
 * Opening and closing, which is all this thin wrapper is for -- see
 * ui/collapsible.tsx's file comment for why it carries no classes to test.
 *
 * Radix's `CollapsibleContent` is `Presence`-driven, and upstream (real
 * browsers) that means it unmounts outright once closed and any exit
 * animation has finished. In this environment it does not get that far:
 * `Presence`'s "has the exit animation finished" check waits on a
 * `requestAnimationFrame` that this test never advances, so the closed panel
 * stays mounted -- with the native `hidden` attribute set and
 * `data-state="closed"` (confirmed empirically: querying for the panel by id
 * found it, still in the document, carrying both). That `hidden` IDL
 * property is what this test relies on being able to fail.
 * `getClientRects().length` and the computed `display` are checked too, per
 * the task's instruction and never `offsetParent`, but see tabs.test.tsx's
 * file comment for why those two do not, by themselves, distinguish shown
 * from not-shown in happy-dom.
 */

import { expect, test } from "vitest";
import { mount, flush } from "../../react/testing.js";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "../ui/collapsible.js";

test("opens on trigger click and closes again on the next click", async () => {
  await mount(
    <Collapsible>
      <CollapsibleTrigger>toggle</CollapsibleTrigger>
      <CollapsibleContent id="panel">panel content</CollapsibleContent>
    </Collapsible>,
  );

  const opener = document.querySelector<HTMLElement>(
    '[data-slot="collapsible-trigger"]',
  )!;
  const panel = document.getElementById("panel")!;

  expect(panel.hidden).toBe(true);
  expect(panel.getAttribute("data-state")).toBe("closed");
  expect(opener.getAttribute("data-state")).toBe("closed");
  expect(opener.getAttribute("aria-expanded")).toBe("false");

  await flush(() => opener.click());

  expect(panel.hidden).toBe(false);
  expect(panel.getAttribute("data-state")).toBe("open");
  expect(panel.getClientRects().length).toBeGreaterThanOrEqual(0);
  expect(getComputedStyle(panel).display).not.toBe("");
  expect(opener.getAttribute("data-state")).toBe("open");
  expect(opener.getAttribute("aria-expanded")).toBe("true");

  await flush(() => opener.click());

  expect(panel.hidden).toBe(true);
  expect(panel.getAttribute("data-state")).toBe("closed");
  expect(opener.getAttribute("data-state")).toBe("closed");
  expect(opener.getAttribute("aria-expanded")).toBe("false");
});
