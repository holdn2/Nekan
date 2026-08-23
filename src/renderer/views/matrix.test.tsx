/**
 * The quadrants. What is pinned here is what a row is made of, which quadrant
 * an add lands in, and the two rules that are easy to lose in a rewrite: the
 * crowding hint is a hint, and a row stays on screen long enough to fade.
 */

import { beforeEach, expect, test, vi } from "vitest";
import type { Task } from "../../shared/types.js";
import { activeOf, setTasks } from "../store.js";
import { setLanguage } from "../i18n.js";
import { clearSelectionSilently } from "../selection.js";
import { notify } from "../render-bus.js";
import { find, mount } from "../react/testing.js";
import { mountMatrix } from "./matrix.js";

const task = (n: number, over: Partial<Task> = {}): Task => ({
  id: `t${n}`,
  text: `할 일 ${n}`,
  quadrant: "q1",
  space: "work",
  orderKey: `m${String(n).padStart(3, "0")}`,
  memo: null,
  dueDate: null,
  createdAt: 1,
  updatedAt: 1,
  completedAt: null,
  deletedAt: null,
  purgedAt: null,
  ...over,
});

/** The four sections index.html owns and React fills. */
function shell() {
  document.body.replaceChildren();
  for (const quad of ["q1", "q2", "q3", "q4"]) {
    const section = document.createElement("section");
    section.className = `quad ${quad}`;
    section.dataset.quad = quad;
    document.body.append(section);
  }
}

const rows = (quad: string) =>
  document.querySelectorAll(`[data-list="${quad}"] .item`);

beforeEach(() => {
  (window as unknown as { api: { save: unknown } }).api = { save: vi.fn() };
  setLanguage("en");
  clearSelectionSilently();
  shell();
});

test("draws each quadrant's own tasks, numbered from one", async () => {
  setTasks([task(1), task(2), task(3, { quadrant: "q3" })]);
  const { flush } = await mount(<div />);
  mountMatrix();
  await flush();

  expect(rows("q1").length).toBe(2);
  expect(rows("q3").length).toBe(1);
  expect(rows("q4").length).toBe(0);
  expect(
    [...document.querySelectorAll('[data-list="q1"] .num')].map(
      (e) => e.textContent,
    ),
  ).toEqual(["1.", "2."]);
  expect(find('[data-count="q1"]').textContent).toBe("2");
});

test("a row carries a memo marker only when there is a memo", async () => {
  setTasks([task(1, { memo: "적어둔 것" }), task(2)]);
  const { flush } = await mount(<div />);
  mountMatrix();
  await flush();
  expect(document.querySelectorAll('[data-list="q1"] .memo-mark').length).toBe(
    1,
  );
  // The marker names itself: a span with a label and no role is not read out.
  expect(find(".memo-mark").getAttribute("role")).toBe("img");
});

test("the crowding hint is a hint, and only q1 has a number", async () => {
  setTasks(Array.from({ length: 5 }, (_, i) => task(i)));
  const { flush } = await mount(<div />);
  mountMatrix();
  await flush();
  expect(find('[data-count="q1"]').classList.contains("crowded")).toBe(false);

  // setTasks seeds without announcing -- that is the sync path's job, and the
  // app's own callers pair the two.
  await flush(() => {
    setTasks(Array.from({ length: 6 }, (_, i) => task(i)));
    notify();
  });
  expect(find('[data-count="q1"]').classList.contains("crowded")).toBe(true);
  // Still six rows: it marks, it never blocks.
  expect(rows("q1").length).toBe(6);

  await flush(() => {
    setTasks(Array.from({ length: 40 }, (_, i) => task(i, { quadrant: "q2" })));
    notify();
  });
  expect(find('[data-count="q2"]').classList.contains("crowded")).toBe(false);
});

test("the add box files into its own quadrant, with the date it holds", async () => {
  setTasks([]);
  const { flush } = await mount(<div />);
  mountMatrix();
  await flush();

  const form = find<HTMLFormElement>('form[data-add="q3"]');
  const text = form.querySelector<HTMLInputElement>('input[type="text"]')!;
  const date = form.querySelector<HTMLInputElement>('input[type="date"]')!;
  const type = (el: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };

  await flush(() => type(text, "새 할 일"));
  await flush(() => type(date, "2026-09-01"));
  await flush(() =>
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ),
  );

  const filed = activeOf("q3");
  expect(filed.map((t) => t.text)).toEqual(["새 할 일"]);
  expect(filed[0].dueDate).toBe("2026-09-01");
  // And the box is empty again, date included.
  expect(text.value).toBe("");
  expect(date.value).toBe("");
});

test("completing a row lets it fade before the store hears", async () => {
  vi.useFakeTimers();
  setTasks([task(1)]);
  const { flush } = await mount(<div />);
  mountMatrix();
  await flush();

  await flush(() => find('[data-list="q1"] .check').click());
  // Still there, and marked so the stylesheet can fade it.
  expect(rows("q1").length).toBe(1);
  expect(find('[data-list="q1"] .item').classList.contains("removing")).toBe(
    true,
  );
  expect(activeOf("q1").length).toBe(1);

  await flush(() => vi.advanceTimersByTime(200));
  expect(activeOf("q1").length).toBe(0);
  vi.useRealTimers();
});
