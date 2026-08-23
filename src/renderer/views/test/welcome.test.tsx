/**
 * The first-run card, and the one state it can get stuck in.
 *
 * A sign-in that is in flight disables both answers, which is right: the
 * question is being answered somewhere else. What made it wrong is that the
 * somewhere else is a browser window this app does not own -- close it and the
 * loopback server here hears nothing, so the promise stays unresolved and the
 * card sits with two dead buttons and no third option.
 */

import { beforeEach, expect, test, vi } from "vitest";
import { find, mount } from "../../react/testing.js";
import { setTasks } from "../../store.js";
import { setLanguage } from "../../i18n.js";
import { Welcome, showWelcome, wireWelcome } from "../welcome.js";

/** A sign-in that never comes back, which is what closing the browser leaves. */
function pendingSignIn() {
  const api = {
    signInWithGoogle: vi.fn(() => new Promise(() => {})),
    cancelSignIn: vi.fn(() => Promise.resolve()),
    setStartupChoice: vi.fn((choice: string) => Promise.resolve(choice)),
    logout: vi.fn(() => Promise.resolve({ ok: true })),
    openPrivacyPolicy: vi.fn(),
  };
  (window as unknown as { api: unknown }).api = api;
  return api;
}

beforeEach(async () => {
  document.body.innerHTML = '<div id="welcome"></div>';
  setTasks([]);
  await setLanguage("ko");
  wireWelcome(() => {});
  showWelcome();
});

test("both answers are disabled while the browser has the sign-in", async () => {
  pendingSignIn();
  const { flush } = await mount(<Welcome />);

  const choices = () => [
    ...document.querySelectorAll<HTMLButtonElement>(".welcome-choice"),
  ];
  expect(choices().map((b) => b.disabled)).toEqual([false, false]);

  await flush(() =>
    find<HTMLButtonElement>(".welcome-choice.recommended").click(),
  );
  expect(choices().map((b) => b.disabled)).toEqual([true, true]);
});

test("a cancel appears with it, and asks main to give the sign-in up", async () => {
  const api = pendingSignIn();
  const { flush } = await mount(<Welcome />);
  expect(document.querySelector(".welcome-cancel")).toBe(null);

  await flush(() =>
    find<HTMLButtonElement>(".welcome-choice.recommended").click(),
  );
  const cancel = find<HTMLButtonElement>(".welcome-cancel");
  expect(cancel.textContent).toBe("취소");

  await flush(() => cancel.click());
  expect(api.cancelSignIn).toHaveBeenCalledTimes(1);
});

test("the answer main sends back is what re-enables the buttons", async () => {
  // Cancelling is main's to do: pressing the button only asks. What actually
  // ends the wait is loginWithGoogle resolving, which is why this test settles
  // the promise rather than asserting on the press alone.
  let settle: (result: unknown) => void = () => {};
  const api = {
    signInWithGoogle: vi.fn(() => new Promise((r) => (settle = r))),
    cancelSignIn: vi.fn(() => Promise.resolve()),
    setStartupChoice: vi.fn((choice: string) => Promise.resolve(choice)),
    openPrivacyPolicy: vi.fn(),
  };
  (window as unknown as { api: unknown }).api = api;

  const { flush } = await mount(<Welcome />);
  await flush(() =>
    find<HTMLButtonElement>(".welcome-choice.recommended").click(),
  );
  await flush(() => settle({ ok: false, error: "cancelled" }));

  const choices = [
    ...document.querySelectorAll<HTMLButtonElement>(".welcome-choice"),
  ];
  expect(choices.map((b) => b.disabled)).toEqual([false, false]);
  expect(document.querySelector(".welcome-cancel")).toBe(null);
  // Still up: a cancelled sign-in has not answered the question.
  expect(find(".welcome-msg").textContent).toBe("로그인이 취소되었습니다.");
  expect(document.getElementById("welcome")?.classList.contains("hidden")).toBe(
    false,
  );
});
