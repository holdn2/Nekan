/**
 * The two record tabs. What is worth pinning here is not the markup -- it is
 * the rules that are easy to get wrong and invisible when they are: search
 * looks at everything rather than at the page, a hidden tab draws nothing, the
 * pager cannot strand you on a page that stopped existing, and -- the one that
 * loses data -- a bulk action acts on the whole list rather than on the page
 * you happen to be looking at.
 */

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Task } from "../../../shared/types.js";
import { doneTasks, setTasks, trashedTasks } from "../../store.js";
import { setLanguage } from "../../i18n.js";
import { act } from "react";
import { find, mount } from "../../react/testing.js";
import { mountArchive, resetArchivePaging } from "../archive.js";
import { PAGE } from "../archive/paging.js";

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
 * Type into the history's search box.
 *
 * The native value setter rather than `input.value =`, because React installs
 * its own setter on the instance and assigning through it does not raise the
 * event React is listening for.
 */
function type(text: string) {
  const search = find<HTMLInputElement>("#historySearch");
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  setter.call(search, text);
  search.dispatchEvent(new Event("input", { bubbles: true }));
}

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

/**
 * The pager. PAGE is imported rather than written as 20, so these read as "one
 * page" and "three pages" and cannot drift from the constant.
 */
const pager = () =>
  document.querySelector("#historyView [data-slot=pagination]");
const pageButtons = () => [
  ...document.querySelectorAll<HTMLButtonElement>(
    "#historyView [data-slot=pagination-link]",
  ),
];
/** The numbered buttons only -- the four step buttons carry no page number. */
const pageNumbers = () =>
  pageButtons()
    .filter((b) => /^\d+$/.test(b.textContent ?? ""))
    .map((b) => b.textContent);
const activePage = () =>
  document.querySelector("#historyView [data-slot=pagination-link][data-active]")
    ?.textContent;
const step = (label: string) =>
  pageButtons().find((b) => b.getAttribute("aria-label") === label)!;

test("draws one page and no more", async () => {
  setTasks(Array.from({ length: PAGE * 3 + 5 }, (_, i) => done(i)));
  const { flush } = await mount(<div />);
  draw();
  await flush();
  expect(rows().length).toBe(PAGE);
  expect(activePage()).toBe("1");
  // Three full pages and a part-full fourth.
  expect(pageNumbers()).toContain("4");
});

test("moves between pages, and the last page holds the remainder", async () => {
  setTasks(Array.from({ length: PAGE * 2 + 3 }, (_, i) => done(i)));
  const { flush } = await mount(<div />);
  draw();
  await flush();

  await flush(() => step("Next page").click());
  expect(activePage()).toBe("2");
  expect(rows().length).toBe(PAGE);

  await flush(() => step("Last page").click());
  expect(activePage()).toBe("3");
  expect(rows().length).toBe(3);

  await flush(() => step("First page").click());
  expect(activePage()).toBe("1");
  expect(rows().length).toBe(PAGE);
});

test("hides the pager when everything fits on one page", async () => {
  setTasks(Array.from({ length: PAGE }, (_, i) => done(i)));
  const { flush } = await mount(<div />);
  draw();
  await flush();
  expect(rows().length).toBe(PAGE);
  // A control whose every button is disabled is furniture: it takes height
  // from the list in order to say nothing.
  expect(pager()).toBeNull();
});

test("numbers a row by its place in its day, not its place on the page", async () => {
  // done() puts forty rows in one day, so page two opens mid-day. Its first
  // row has to read 21. -- numbering the page instead would run 1..20 twice
  // under a single date header.
  setTasks(Array.from({ length: 40 }, (_, i) => done(i)));
  const { flush } = await mount(<div />);
  draw();
  await flush();
  await flush(() => step("Next page").click());
  const numbers = [...document.querySelectorAll("#historyView .num")].map(
    (el) => el.textContent,
  );
  expect(numbers[0]).toBe("21.");
  expect(numbers.at(-1)).toBe("40.");
  // And the page still says which day it is showing, rather than inheriting a
  // header that belongs to the page before.
  expect(document.querySelectorAll("#historyView .day").length).toBe(1);
});

test("a shrinking list pulls you back to the last page that exists", async () => {
  // Sitting on the last of three pages when enough rows go to leave two. Page
  // 3 would draw nothing, which reads as data that is gone rather than as a
  // page that is -- and resetting to page 1 instead would throw away your
  // place after deleting a single row.
  const many = Array.from({ length: PAGE * 3 }, (_, i) => done(i));
  setTasks(many);
  const { flush } = await mount(<div />);
  draw();
  await flush();
  await flush(() => step("Last page").click());
  expect(activePage()).toBe("3");

  await flush(() => setTasks(many.slice(0, PAGE * 2)));
  expect(activePage()).toBe("2");
  expect(rows().length).toBe(PAGE);

  // Emptied altogether: one page again, and the pager goes with it.
  await flush(() => setTasks([]));
  expect(rows().length).toBe(0);
  expect(pager()).toBeNull();
  expect(find("#historyEmpty").classList.contains("hidden")).toBe(false);
});

test("searching starts over at the first page", async () => {
  // Landing on page 4 of a one-page result is a blank screen that looks like a
  // bug.
  const tasks = Array.from({ length: PAGE * 4 }, (_, i) => done(i));
  tasks[3] = done(3, { text: "바늘 하나" });
  setTasks(tasks);
  const { flush } = await mount(<div />);
  draw();
  await flush();
  await flush(() => step("Last page").click());
  expect(activePage()).toBe("4");

  await flush(() => type("바늘"));
  expect(rows().length).toBe(1);
  expect(find("#historyView .hitem .text").textContent).toBe("바늘 하나");
  // One page of results, so there is no pager left to be on page 4 of.
  expect(pager()).toBeNull();
});

test("the two tabs page independently", async () => {
  // Both are mounted at once, and page 3 of one is not page 3 of the other.
  const { setTab } = await import("../../window/chrome.js");
  setTasks([
    ...Array.from({ length: PAGE * 3 }, (_, i) => done(i)),
    ...Array.from({ length: PAGE * 3 }, (_, i) =>
      done(1000 + i, {
        completedAt: null,
        deletedAt: Date.UTC(2026, 7, 20) + i,
      }),
    ),
  ]);
  const { flush } = await mount(<div />);
  draw();
  await flush();
  await flush(() => step("Last page").click());
  expect(activePage()).toBe("3");

  // Changing tabs resets both, and that is chrome's call rather than the
  // component's -- see resetArchivePaging.
  await flush(() => setTab("trash"));
  expect(
    document.querySelector(
      "#trashView [data-slot=pagination-link][data-active]",
    )?.textContent,
  ).toBe("1");
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

  await flush(() => type("바늘"));
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
  await flush(() => type("없는 말"));
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

/**
 * THE ONE THAT LOSES DATA.
 *
 * A bulk action acts on every row the tab is showing -- the whole list behind
 * the pager, not the twenty on screen. Paging is what makes this newly easy to
 * get wrong: `drawn` and `everything` are both in scope at the click, they
 * differ only past row twenty, and every smaller list in this file would pass
 * either way. So this uses three pages deliberately, and asserts on the store
 * rather than on the DOM: after emptying, the rows on screen are gone whichever
 * mistake was made, and only the store says whether the other 40 went with
 * them.
 *
 * The count in the question is asserted for the same reason. It is read from
 * `pending.items`, so if a page's worth were ever captured there, the dialog
 * would say 20 while claiming to empty the history -- and the wrong array
 * would already have been handed to run().
 */
test("a bulk action empties the whole list, not the page on screen", async () => {
  const all = Array.from({ length: PAGE * 3 }, (_, i) => done(i));
  setTasks(all);
  const { flush } = await mount(<div />);
  draw();
  await flush();
  expect(rows().length).toBe(PAGE);
  expect(doneTasks().length).toBe(PAGE * 3);

  await flush(() => bar().click());
  // 60, not 20. The question counts the same array run() is about to be given.
  expect(find("[role=alertdialog]").textContent).toContain(String(PAGE * 3));

  await flush(() =>
    find<HTMLButtonElement>("[data-slot=alert-dialog-action]").click(),
  );
  // Nothing completed is left anywhere, and all 60 are in the trash -- not the
  // 20 that were drawn.
  expect(doneTasks().length).toBe(0);
  expect(trashedTasks().length).toBe(PAGE * 3);
});

test("a bulk action on a later page still takes the whole list", async () => {
  // Paged to the end first, so `drawn` is the final part-page. A handler that
  // acted on the page would take three rows and leave forty-three.
  const all = Array.from({ length: PAGE * 2 + 3 }, (_, i) => done(i));
  setTasks(all);
  const { flush } = await mount(<div />);
  draw();
  await flush();
  await flush(() => step("Last page").click());
  expect(rows().length).toBe(3);

  await flush(() => bar().click());
  expect(find("[role=alertdialog]").textContent).toContain(String(PAGE * 2 + 3));
  await flush(() =>
    find<HTMLButtonElement>("[data-slot=alert-dialog-action]").click(),
  );
  expect(doneTasks().length).toBe(0);
  expect(trashedTasks().length).toBe(PAGE * 2 + 3);
});

test("a bulk action ignores the search, and takes what the tab holds", async () => {
  // all() is the list the tab holds, already scoped to the board on screen.
  // Narrowing it by the query would quietly turn "empty the history" into
  // "empty the rows matching 바늘" -- and re-deriving it from tasks instead
  // would take the other board's rows with it.
  const tasks = Array.from({ length: PAGE * 2 }, (_, i) => done(i));
  tasks[0] = done(0, { text: "바늘" });
  setTasks(tasks);
  const { flush } = await mount(<div />);
  draw();
  await flush();

  await flush(() => type("바늘"));
  expect(rows().length).toBe(1);

  await flush(() => bar().click());
  expect(find("[role=alertdialog]").textContent).toContain(String(PAGE * 2));
  await flush(() =>
    find<HTMLButtonElement>("[data-slot=alert-dialog-action]").click(),
  );
  expect(doneTasks().length).toBe(0);
  expect(trashedTasks().length).toBe(PAGE * 2);
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
