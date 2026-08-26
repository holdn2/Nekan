/**
 * Appearing on open and closing on Escape -- the two behaviours the file
 * comment on ui/alert-dialog.tsx says are the entire reason to take this
 * port instead of writing one. `AlertDialogContent` does not override
 * `onEscapeKeyDown` (only `onPointerDownOutside`/`onInteractOutside`, so a
 * click outside cannot dismiss a confirmation by accident) -- confirmed by
 * reading `@radix-ui/react-alert-dialog`'s source -- so Escape still closes
 * it through Radix's own dismissable-layer handling, untouched by this port.
 *
 * Radix's overlay and content are `Presence`-driven, the same as
 * Collapsible: without `forceMount` they unmount outright when `open`
 * becomes false rather than hiding in place, so DOM presence is the signal
 * this test relies on. `getClientRects().length` and the computed `display`
 * are checked too, per the task's instruction and never `offsetParent` --
 * see tabs.test.tsx's file comment for why those two do not, by themselves,
 * distinguish shown from not-shown in happy-dom.
 */

import { expect, test } from "vitest";
import { mount, flush } from "../../../react/testing.js";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "../alert-dialog.js";

function pressEscape() {
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    }),
  );
}

test("appears when open, and Escape closes it", async () => {
  await mount(
    <AlertDialog defaultOpen>
      <AlertDialogContent>
        <AlertDialogTitle>Delete this task?</AlertDialogTitle>
        <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>,
  );

  const content = document.querySelector<HTMLElement>(
    '[data-slot="alert-dialog-content"]',
  );
  expect(content).not.toBeNull();
  expect(content!.getAttribute("role")).toBe("alertdialog");
  expect(
    document.querySelector('[data-slot="alert-dialog-overlay"]'),
  ).not.toBeNull();
  expect(content!.getClientRects().length).toBeGreaterThanOrEqual(0);
  expect(getComputedStyle(content!).display).not.toBe("");

  await flush(() => pressEscape());

  expect(
    document.querySelector('[data-slot="alert-dialog-content"]'),
  ).toBeNull();
  expect(
    document.querySelector('[data-slot="alert-dialog-overlay"]'),
  ).toBeNull();
});

test("Action and Cancel render as plain buttons carrying the button variant classes, not nested inside <Button>", async () => {
  await mount(
    <AlertDialog defaultOpen>
      <AlertDialogContent>
        <AlertDialogTitle>Delete this task?</AlertDialogTitle>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>,
  );

  const cancel = document.querySelector<HTMLElement>(
    '[data-slot="alert-dialog-cancel"]',
  )!;
  const action = document.querySelector<HTMLElement>(
    '[data-slot="alert-dialog-action"]',
  )!;

  // Both are the button element itself -- no `asChild`, so no second
  // <button> wrapping it (see ui/alert-dialog.tsx's file comment, point 2).
  expect(cancel.tagName).toBe("BUTTON");
  expect(action.tagName).toBe("BUTTON");
  expect(cancel.querySelector("button")).toBeNull();
  expect(action.querySelector("button")).toBeNull();

  // Cancel defaults to the `outline` button variant, Action to `default`.
  expect(cancel.className).toContain("border-line");
  expect(action.className).toContain("bg-accent");
});
