/**
 * What the settings panel is made of, now that it is made of the ported
 * primitives rather than of the same eight utilities spelled out four times.
 *
 * The `data-slot` attributes are the thing to assert on. Every file in
 * components/ui/ marks its parts with one, they survive a restyle in a way a
 * class list does not, and in a happy-dom test they are the only evidence that
 * a screen is drawing a primitive at all -- there is no cascade here, so what
 * a thing *looks* like cannot be asked in this file.
 *
 * What can be asked, and is, is whether the classes those primitives write
 * actually compiled. classCompiled() reads the real build output: a spacing
 * number this app's scale does not define (`p-4`, `size-4`, `md:` anything)
 * lands in the class attribute looking exactly like a real one and paints
 * nothing at all, and that is the failure this file is here to catch on the
 * day somebody edits these.
 *
 * The panel is filled through mountSettings(), the same entry point app.ts
 * uses, because the body is not exported and should not be: what it draws is
 * the panel index.html owns, and a test that rendered it into a bare <div>
 * would be testing a different arrangement.
 */

import { beforeEach, expect, test } from "vitest";
import { find, flush } from "../../react/testing.js";
import { classCompiled } from "../../components/ui/test/compiled-css.js";
import { setLanguage } from "../../i18n.js";
import { closeSettings, openSettings } from "../../panels.js";
import { mountSettings } from "../settings.js";

/** Fill the panel and open it, and let React finish. */
async function open() {
  mountSettings();
  await flush(() => void openSettings());
  await flush();
}

beforeEach(async () => {
  closeSettings();
  document.body.innerHTML =
    '<div id="settingsBackdrop" class="hidden"></div>' +
    '<section id="settingsPanel" class="hidden"></section>' +
    '<button id="settingsBtn"></button>';
  (window as unknown as { api: unknown }).api = {
    setLanguage: () => Promise.resolve(),
  };
  await setLanguage("ko");
});

test("the rows are divided by separators rather than by a border each", async () => {
  await open();

  const rules = document.querySelectorAll('[data-slot="separator"]');
  // Three: under the header, and between each pair of the three rows.
  expect(rules.length).toBe(3);
  for (const rule of rules) {
    // Radix's own attribute, not a class -- ui/separator styles off it, and a
    // hand-written `data-horizontal:` would compile to a selector that never
    // matches (see ui/separator.tsx's file comment).
    expect(rule.getAttribute("data-orientation")).toBe("horizontal");
    // Decorative, so it is not announced as something to act on.
    expect(rule.getAttribute("role")).toBe("none");
  }
  expect(classCompiled("data-[orientation=horizontal]:h-px")).toBe(true);
  expect(classCompiled("bg-line")).toBe(true);
});

test("the account block is a card, and the sync label is its title", async () => {
  await open();

  const card = document.querySelector<HTMLElement>('[data-slot="card"]');
  expect(card).not.toBe(null);
  // sm, because the panel is 320px wide and the default's padding on top of
  // the panel's own would leave the account block 256px to lay out an address,
  // a state and two buttons in.
  expect(card!.dataset.size).toBe("sm");
  expect(find('[data-slot="card-title"]').textContent).toBe("기기 간 동기화");
  // The block itself is still inside, under the id the rest of the app knows.
  expect(card!.querySelector("#account")).not.toBe(null);
  expect(classCompiled("group-data-[size=sm]/card:px-xl")).toBe(true);
});

test("the close and export buttons are ui/buttons, and neutral ones", async () => {
  await open();

  const close = find("#settingsClose");
  expect(close.dataset.slot).toBe("button");
  // ghost: no fill at rest. On a panel this size a filled close button reads
  // as the thing to press.
  expect(close.dataset.variant).toBe("ghost");
  expect(close.getAttribute("aria-label")).toBe("닫기");

  const exportBtn = find("#settingsExport");
  expect(exportBtn.dataset.slot).toBe("button");
  expect(exportBtn.dataset.variant).toBe("outline");

  // Both rest transparent, and that only holds because ui/button says so in
  // its base classes: this app imports no Tailwind preflight, so a <button>
  // with no background of its own keeps the OS's grey fill.
  expect(close.className).toContain("bg-transparent");
  expect(classCompiled("bg-transparent")).toBe(true);
});

test("the theme control is deliberately not a ui/button", async () => {
  await open();

  // .switch is a two-option segmented pill whose knob is the container's own
  // ::before, placed by `:has(> .switch-btn:last-child.active)`. ui/button has
  // no such variant, and giving the two halves one would put a background
  // under a knob that is already the fill.
  const seg = find("#themeSeg");
  expect(seg.className).toContain("switch");
  for (const half of seg.querySelectorAll("button")) {
    expect((half as HTMLElement).dataset.slot).toBe(undefined);
  }
});
