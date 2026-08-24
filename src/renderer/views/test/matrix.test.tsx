/**
 * The quadrants. What is pinned here is what a row is made of, which quadrant
 * an add lands in, and the two rules that are easy to lose in a rewrite: the
 * crowding hint is a hint, and a row stays on screen long enough to fade.
 */

import { act } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Task } from "../../../shared/types.js";
import { activeOf, setTasks } from "../../store.js";
import { setLanguage } from "../../i18n.js";
import { clearSelectionSilently } from "../../selection.js";
import { notify } from "../../render-bus.js";
import { find, mount } from "../../react/testing.js";
import { mountMatrix } from "../matrix.js";

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

/**
 * The roots each case made, so the next one does not inherit them.
 *
 * shell() replaces the body, which detaches the four sections but not the
 * roots rendering into them -- those stay subscribed to the render bus, and
 * every notify() after that redraws trees nobody can see. It is not only
 * wasted work: the listener count below is taken across every row in the
 * document, and a stale tree's rows are in it.
 */
let roots: ReturnType<typeof mountMatrix> = [];
const draw = () => {
  roots = mountMatrix();
};

beforeEach(() => {
  (window as unknown as { api: { save: unknown } }).api = { save: vi.fn() };
  setLanguage("en");
  clearSelectionSilently();
  shell();
});

afterEach(async () => {
  const made = roots;
  roots = [];
  await act(async () => made.forEach((root) => root.unmount()));
});

test("draws each quadrant's own tasks, numbered from one", async () => {
  setTasks([task(1), task(2), task(3, { quadrant: "q3" })]);
  const { flush } = await mount(<div />);
  draw();
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
  draw();
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
  draw();
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
  draw();
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
  draw();
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

test("a row does not collect a listener every time it redraws", async () => {
  // The leak this replaced was invisible: every handler cleared the timer the
  // one before it set, so the click still did exactly one thing. What grew was
  // the row -- one more pair of listeners per notify(), for as long as the
  // window stayed open.
  const counted: Record<string, number> = { click: 0, dblclick: 0 };
  const real = HTMLElement.prototype.addEventListener;
  const realOff = HTMLElement.prototype.removeEventListener;
  const isRow = (el: HTMLElement) => el.classList?.contains("item");
  const tally = (step: number) =>
    function (this: HTMLElement, ...args: Parameters<typeof real>) {
      const [type] = args;
      if (isRow(this) && type in counted) counted[type] += step;
      return null as never;
    };
  HTMLElement.prototype.addEventListener = function (
    this: HTMLElement,
    ...args: Parameters<typeof real>
  ) {
    tally(1).apply(this, args);
    return real.apply(this, args);
  };
  HTMLElement.prototype.removeEventListener = function (
    this: HTMLElement,
    ...args: Parameters<typeof realOff>
  ) {
    tally(-1).apply(this, args);
    return realOff.apply(this, args);
  };

  try {
    setTasks([task(1)]);
    draw();
    const { flush } = await mount(<div />);
    await flush();
    const afterFirstDraw = { ...counted };

    for (let i = 0; i < 5; i += 1) await flush(() => notify());

    expect(counted).toEqual(afterFirstDraw);
    expect(counted.click).toBe(1);
  } finally {
    HTMLElement.prototype.addEventListener = real;
    HTMLElement.prototype.removeEventListener = realOff;
  }
});
