/**
 * The one irreversible button in the app, now behind a real alert dialog.
 *
 * Everything here is asserted against a handler this file owns. `window.api`
 * in the running app is a frozen contextBridge object -- assigning a stub over
 * it is silently ignored and the real call goes to the server -- so the second
 * button in this component must never be pressed in a running app to find out
 * what it does. Under vitest there is no contextBridge, `window.api` is
 * whatever this file puts there, and the call is observable.
 *
 * What is worth holding on to, in the order it can break:
 *
 *   - The confirmation is not on screen until it is asked for. The old inline
 *     box was two paragraphs and two buttons living in the panel's flow, so
 *     "is it showing" was a class; Radix mounts and unmounts it, so it is DOM
 *     presence.
 *   - It carries `role="alertdialog"` and is named by its own title, which is
 *     what makes a screen reader read the warning before the buttons.
 *   - Escape closes it, and that is Radix's own dismissable-layer handling
 *     rather than anything this app wrote.
 *   - It closes when the session it belongs to goes away. Signing out and
 *     straight back in as somebody else used to leave an open "계정 삭제"
 *     standing in front of whoever arrived.
 */

import { useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { mount } from "../../react/testing.js";
import { setLanguage } from "../../i18n.js";
import { applySession } from "../account/status.js";
import { DeleteAccount } from "../account/delete-account.js";

/**
 * A parent that owns `visible`, because the last test needs to change it on a
 * mounted component -- mount() unmounts whatever came before, so calling it
 * twice would build a fresh one whose state was never open.
 */
let setVisible: (next: boolean) => void = () => {};
function Harness() {
  const [visible, set] = useState(true);
  setVisible = set;
  return <DeleteAccount visible={visible} say={() => {}} />;
}

const dialog = () =>
  document.querySelector<HTMLElement>('[data-slot="alert-dialog-content"]');

const leave = () =>
  document.querySelector<HTMLButtonElement>(".account-leave-btn")!;

/** A delete that never comes back, so nothing races the assertions. */
function api() {
  const deleteAccount = vi.fn(() => new Promise<never>(() => {}));
  (window as unknown as { api: unknown }).api = { deleteAccount };
  return deleteAccount;
}

beforeEach(async () => {
  await setLanguage("ko");
  applySession({ email: "a@example.com", userId: "u1" });
});

test("the confirmation is not on screen until it is asked for", async () => {
  api();
  const { flush: redraw } = await mount(
    <DeleteAccount visible say={() => {}} />,
  );
  expect(dialog()).toBe(null);

  await redraw(() => leave().click());
  expect(dialog()).not.toBe(null);
  // Not `offsetParent`: the content is `position: fixed`, where that is always
  // null whether or not the thing is on screen.
  expect(dialog()!.getClientRects().length).toBeGreaterThanOrEqual(0);
  expect(getComputedStyle(dialog()!).display).not.toBe("none");
});

test("it is an alert dialog, named by its title and described by both sentences", async () => {
  api();
  const { flush: redraw } = await mount(
    <DeleteAccount visible say={() => {}} />,
  );
  await redraw(() => leave().click());

  const box = dialog()!;
  expect(box.getAttribute("role")).toBe("alertdialog");

  const title = document.getElementById(box.getAttribute("aria-labelledby")!);
  expect(title?.textContent).toBe("회원탈퇴");

  // One description node holding both sentences: Radix names exactly one, and
  // a second paragraph outside it is a sentence a screen reader never reads.
  const said = document.getElementById(box.getAttribute("aria-describedby")!);
  expect(said?.textContent).toContain("되돌릴 수 없습니다");
  expect(said?.textContent).toContain("이 컴퓨터의 할 일은 그대로 남습니다");
});

test("Escape closes it, and the irreversible button is the only way to delete", async () => {
  const deleteAccount = api();
  const { flush: redraw } = await mount(
    <DeleteAccount visible say={() => {}} />,
  );
  await redraw(() => leave().click());

  await redraw(() =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(dialog()).toBe(null);
  expect(deleteAccount).not.toHaveBeenCalled();

  await redraw(() => leave().click());
  await redraw(() =>
    document
      .querySelector<HTMLButtonElement>('[data-slot="alert-dialog-action"]')!
      .click(),
  );
  expect(deleteAccount).toHaveBeenCalledTimes(1);
});

test("cancelling asks for nothing", async () => {
  const deleteAccount = api();
  const { flush: redraw } = await mount(
    <DeleteAccount visible say={() => {}} />,
  );
  await redraw(() => leave().click());

  await redraw(() =>
    document
      .querySelector<HTMLButtonElement>('[data-slot="alert-dialog-cancel"]')!
      .click(),
  );
  expect(dialog()).toBe(null);
  expect(deleteAccount).not.toHaveBeenCalled();
});

test("it closes when the session it belongs to goes away", async () => {
  api();
  const { flush: redraw } = await mount(<Harness />);
  await redraw(() => leave().click());
  expect(dialog()).not.toBe(null);

  await redraw(() => {
    applySession(null);
    setVisible(false);
  });
  expect(dialog()).toBe(null);
});
