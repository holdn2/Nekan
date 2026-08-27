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
import { classCompiled } from "../../components/ui/test/compiled-css.js";
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

test("the card is a ui/card, and the two answers are ui/buttons", async () => {
  pendingSignIn();
  await mount(<Welcome />);

  const card = find('[data-slot="card"]');
  expect(card.className).toContain("welcome-card");
  // sm: the default's 16px padding, on top of the overlay's own, costs height
  // this card does not have -- it was measured against a 760x520 window.
  expect(card.dataset.size).toBe("sm");
  // Header, content and footer, in that order and all present. The footer is
  // what used to be a paragraph with a top margin pretending to be one.
  expect(
    [...card.children].map((c) => (c as HTMLElement).dataset.slot),
  ).toEqual(["card-header", "card-content", "card-footer"]);

  const choices = [
    ...document.querySelectorAll<HTMLElement>(".welcome-choice"),
  ];
  expect(choices.map((b) => b.dataset.slot)).toEqual(["button", "button"]);
  // Neutral chrome on both, and never `default`: the recommended one carries
  // the Google mark, and Google asks that the wordmark be the only colour on a
  // button offering its sign-in. `outline` is a border and a panel fill;
  // `default` is the app accent, which is the thing the guidelines forbid.
  expect(choices.map((b) => b.dataset.variant)).toEqual(["outline", "outline"]);
  expect(choices[0].className).not.toContain("bg-accent");

  // ui/button is built for one line of text; these are two lines tall and fill
  // the card. All four overrides have to actually compile.
  for (const c of ["h-auto", "w-full", "justify-start", "whitespace-normal"]) {
    expect(classCompiled(c)).toBe(true);
  }
});

test("changing the language repaints the card", async () => {
  // The card is one of the three places that historically did not follow a
  // language change -- it was drawn once and kept the words it was born with,
  // which is why relabelWelcome() had to exist. It follows the render bus now,
  // and this is what says so: setLanguage() ends in notify(), and Welcome
  // subscribes through useRenderSignal().
  pendingSignIn();
  const { flush } = await mount(<Welcome />);
  expect(find(".welcome-lede").textContent).toBe("할 일을 어디에 둘까요?");

  await setLanguage("en");
  await flush();
  expect(find(".welcome-lede").textContent).toBe(
    "Where should your tasks live?",
  );
  // Not only the lede: the answers and the footer are drawn by other files and
  // have to come along.
  expect(find(".welcome-choice.recommended").textContent).toContain(
    "Recommended",
  );
  expect(find(".welcome-foot").textContent).toContain("Settings");

  await setLanguage("ko");
});
