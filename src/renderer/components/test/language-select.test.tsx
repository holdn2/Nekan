/**
 * The Radix-backed language picker.
 *
 * Three things worth pinning down: picking an item tells both the render bus
 * and main, a language change made elsewhere (the other picker, or a test
 * calling setLanguage directly) is reflected without remounting -- the exact
 * failure mode CLAUDE.md describes for "built once and left alone" controls --
 * and the list is read from window.api.languages rather than assumed to be
 * two, so a third language does not need a second component.
 *
 * Escape is covered because it is the one interaction that must do nothing:
 * closing the popup must not call back to main.
 */

import { expect, test, vi } from "vitest";
import { find, mount } from "../../react/testing.js";
import { setLanguage } from "../../i18n.js";
import { LanguageSelect } from "../language-select.js";

function stubApi(languages: string[] = ["ko", "en"]) {
  const api = { languages, setLanguage: vi.fn() };
  (window as unknown as { api: unknown }).api = api;
  return api;
}

const options = () => [
  ...document.querySelectorAll<HTMLElement>('[role="option"]'),
];

test("opening the trigger lists every language from preload, not a hardcoded two", async () => {
  stubApi(["ko", "en"]);
  await setLanguage("ko");
  const { flush } = await mount(<LanguageSelect id="lang" />);
  await flush(() => find<HTMLButtonElement>("#lang").click());
  expect(options().map((o) => o.textContent)).toEqual(["한국어", "English"]);
});

test("a third language in the list needs no change here", async () => {
  // The catalogues do not actually have a third language, but the component
  // must not assume there are exactly two -- that assumption is what sank the
  // switch-pill control this replaced (CLAUDE.md, "언어 선택은 .switch가 아니라").
  stubApi(["ko", "en", "ja"]);
  await setLanguage("ko");
  const { flush } = await mount(<LanguageSelect id="lang3" />);
  await flush(() => find<HTMLButtonElement>("#lang3").click());
  expect(options()).toHaveLength(3);
});

test("picking an item tells both the render bus and main", async () => {
  const api = stubApi();
  await setLanguage("ko");
  const { flush } = await mount(<LanguageSelect id="lang" />);
  const trigger = find<HTMLButtonElement>("#lang");
  await flush(() => trigger.click());
  const english = options().find((o) => o.textContent === "English")!;
  await flush(() => english.click());

  expect(api.setLanguage).toHaveBeenCalledWith("en");
  // setLanguage() (the renderer's own, not window.api's) rang the render bus,
  // and useRenderSignal() is what makes the trigger's own label follow.
  expect(trigger.textContent).toBe("English");
});

test("the trigger's own label follows a language change made elsewhere", async () => {
  stubApi();
  await setLanguage("ko");
  const { flush } = await mount(<LanguageSelect id="lang" />);
  const trigger = find<HTMLButtonElement>("#lang");
  expect(trigger.textContent).toBe("한국어");

  // Nothing here touches this component -- this is the other picker, or a
  // sync pulling a setting from another device, calling the same function.
  await flush(() => setLanguage("en"));
  expect(trigger.textContent).toBe("English");

  await flush(() => setLanguage("ko"));
  expect(trigger.textContent).toBe("한국어");
});

test("Escape closes the popup without calling back to main", async () => {
  const api = stubApi();
  await setLanguage("ko");
  const { flush } = await mount(<LanguageSelect id="lang" />);
  const trigger = find<HTMLButtonElement>("#lang");
  await flush(() => trigger.click());
  expect(trigger.getAttribute("aria-expanded")).toBe("true");

  await flush(() =>
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );

  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(api.setLanguage).not.toHaveBeenCalled();
  expect(trigger.textContent).toBe("한국어");
});
