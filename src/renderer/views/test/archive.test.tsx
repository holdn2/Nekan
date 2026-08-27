/**
 * The two record tabs. What is worth pinning here is not the markup -- it is
 * the three rules that are easy to get wrong and invisible when they are:
 * search looks at everything rather than at the page, a hidden tab draws
 * nothing, and the count of what is not drawn is on screen.
 */

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Task } from "../../../shared/types.js";
import { setTasks } from "../../store.js";
import { setLanguage } from "../../i18n.js";
import { act } from "react";
import { find, mount } from "../../react/testing.js";
import { mountArchive, resetArchivePaging } from "../archive.js";

const DAY = 86400000;

const done = (n: number, over: Partial<Task> = {}): Task => ({
  id: `t${n}`,
  text: `일 ${n}`,
  quadrant: "q1",
  space: "work",
  orderKey: `m${n}`,
  memo: null,
  dueDate: null,
  createdAt: 1,
  updatedAt: 1,
  // Spread across three days, newest first, so the grouping has something to do.
  completedAt: Date.UTC(2026, 7, 20) + Math.floor(n / 40) * DAY + n,
  deletedAt: null,
  purgedAt: null,
  ...over,
});

/**
 * The bits of index.html these components reach for: the two sections they
 * fill, and the tab strip window/chrome toggles.
 */
function shell() {
  document.body.replaceChildren();
  for (const id of ["historyView", "trashView"]) {
    const section = document.createElement("section");
    section.id = id;
    section.className = "view history hidden";
    document.body.append(section);
  }
  for (const id of ["inboxPanel", "matrixView", "guideView"]) {
    const el = document.createElement("div");
    el.id = id;
    document.body.append(el);
  }
}

const rows = () => document.querySelectorAll("#historyView .hitem");

/**
 * The roots each case made, so the next one does not inherit them.
 *
 * shell() replaces the body, which detaches the sections but not the roots
 * rendering into them -- they stay subscribed to the render bus, and every
 * setTasks() after that redraws trees nobody can see.
 */
let roots: ReturnType<typeof mountArchive> = [];
const draw = () => {
  roots = mountArchive();
};

afterEach(async () => {
  const made = roots;
  roots = [];
  await act(async () => made.forEach((root) => root.unmount()));
});

beforeEach(async () => {
  (window as unknown as { api: { save: unknown } }).api = { save: vi.fn() };
  setLanguage("en");
  resetArchivePaging();
  shell();
  const { setTab } = await import("../../window/chrome.js");
  setTab("history");
});

test("draws nothing while its tab is not the one on screen", async () => {
  setTasks([done(1)]);
  const { setTab } = await import("../../window/chrome.js");
  const { flush } = await mount(<div />);
  draw();
  await flush(() => setTab("trash"));
  expect(document.querySelector("#historyView")?.childElementCount).toBe(0);
  await flush(() => setTab("history"));
  expect(rows().length).toBe(1);
});

test("groups by day and numbers from one inside each day", async () => {
  setTasks([done(1), done(2), done(41), done(42)]);
  const { flush } = await mount(<div />);
  draw();
  await flush();
  expect(document.querySelectorAll("#historyView .day").length).toBe(2);
  const numbers = [...document.querySelectorAll("#historyView .num")].map(
    (el) => el.textContent,
  );
  expect(numbers).toEqual(["1.", "2.", "1.", "2."]);
});

test("stops at a page and says how many it did not draw", async () => {
  setTasks(Array.from({ length: 130 }, (_, i) => done(i)));
  const { flush } = await mount(<div />);
  draw();
  await flush();
  expect(rows().length).toBe(100);
  const more = find("#historyView .more button");
  expect(more.textContent).toContain("30");
  await flush(() => more.click());
  expect(rows().length).toBe(130);
  expect(document.querySelector("#historyView .more")).toBeNull();
});

test("search looks at everything, not at the page", async () => {
  // The match is the oldest row of the hundred and thirty, so it sorts last
  // and lands well past the first page -- searching the drawn rows instead
  // would lose it at exactly the moment somebody goes looking for it.
  const tasks = Array.from({ length: 130 }, (_, i) => done(i));
  tasks[120] = done(120, { text: "바늘", completedAt: 1 });
  setTasks(tasks);
  const { flush } = await mount(<div />);
  draw();
  await flush();

  const search = find<HTMLInputElement>("#historySearch");
  await flush(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(search, "바늘");
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(rows().length).toBe(1);
  expect(find("#historyView .hitem .text").textContent).toBe("바늘");
});

test("says the list is empty differently from a search that found nothing", async () => {
  setTasks([]);
  const { flush } = await mount(<div />);
  draw();
  await flush();
  const empty = find("#historyEmpty");
  expect(empty.classList.contains("hidden")).toBe(false);
  const wording = empty.textContent;

  setTasks([done(1)]);
  await flush(() => {
    const search = find<HTMLInputElement>("#historySearch");
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(search, "없는 말");
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(find("#historyEmpty").textContent).not.toBe(wording);
});

/**
 * The bulk question used to be window.confirm(), which blocked the thread and
 * could not be looked at. These three pin what replaced it: that the OS dialog
 * is gone, that answering no really does nothing, and -- the one that would
 * lose data if it broke -- that yes acts on the rows the tab was showing.
 */
const bar = () => find("#historyView button:not(.act)");

test("asks in the app rather than in an OS dialog, and no means no", async () => {
  const confirmed = vi.fn(() => true);
  vi.stubGlobal("confirm", confirmed);
  setTasks([done(1), done(2), done(3)]);
  const { flush } = await mount(<div />);
  draw();
  await flush();

  await flush(() => bar().click());
  expect(confirmed).not.toHaveBeenCalled();
  const dialog = find("[role=alertdialog]");
  // The count is interpolated into the question, so it is what proves the
  // wording came out of the catalogue rather than out of a placeholder.
  expect(dialog.textContent).toContain("3");

  await flush(() =>
    find<HTMLButtonElement>("[data-slot=alert-dialog-cancel]").click(),
  );
  expect(document.querySelector("[role=alertdialog]")).toBeNull();
  expect(rows().length).toBe(3);
  vi.unstubAllGlobals();
});

test("empties only what the tab was showing, and only after yes", async () => {
  setTasks([done(1), done(2), done(3)]);
  const { flush } = await mount(<div />);
  draw();
  await flush();

  await flush(() => bar().click());
  await flush(() =>
    find<HTMLButtonElement>("[data-slot=alert-dialog-action]").click(),
  );
  expect(document.querySelector("[role=alertdialog]")).toBeNull();
  expect(rows().length).toBe(0);
});

test("hands focus back to the button that asked", async () => {
  // Radix returns focus to its own Trigger, and this dialog has none -- it is
  // opened from state so the bulk button stays an ordinary button. Measured in
  // the app before the handler went in: Escape left focus on <body>.
  setTasks([done(1), done(2)]);
  const { flush } = await mount(<div />);
  draw();
  await flush();

  const button = bar() as HTMLButtonElement;
  await flush(() => {
    button.focus();
    button.click();
  });
  expect(find("[role=alertdialog]").contains(document.activeElement)).toBe(
    true,
  );

  await flush(() =>
    find<HTMLButtonElement>("[data-slot=alert-dialog-cancel]").click(),
  );
  expect(document.activeElement).toBe(button);
});

test("the search box is the shared input primitive, not a bare one", async () => {
  setTasks([done(1)]);
  const { flush } = await mount(<div />);
  draw();
  await flush();
  const search = find<HTMLInputElement>("#historySearch");
  expect(search.dataset.slot).toBe("input");
  // The three the primitive cannot be left to decide on its own here: the body
  // is 13px and sets user-select: none, and w-full would start the box at the
  // full width of the bar and squeeze the buttons beside it.
  for (const cls of ["text-md", "select-text", "w-auto"]) {
    expect(search.classList.contains(cls)).toBe(true);
  }
  expect(search.classList.contains("text-xl")).toBe(false);
});
