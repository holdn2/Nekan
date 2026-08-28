/**
 * The page window, which is the only part of ui/pagination.tsx that decides
 * anything. The rest is markup the archive tests already drive end to end.
 *
 * What is worth pinning: the ends, where the window is clipped and one
 * ellipsis has nothing left to hide, and the boundary where a gap of exactly
 * one page is drawn as that page instead -- an ellipsis standing in for a
 * single number is wider than the number and cannot be clicked.
 */

import { expect, test } from "vitest";
import { PaginationBar, pageWindow } from "../pagination.js";
import { mount } from "../../../react/testing.js";

const labels = {
  nav: "Pages",
  first: "First page",
  previous: "Previous page",
  next: "Next page",
  last: "Last page",
  page: (n: number) => `Page ${n}`,
};

test("shows every page while they all fit", () => {
  expect(pageWindow(1, 1)).toEqual([1]);
  expect(pageWindow(2, 3)).toEqual([1, 2, 3]);
  expect(pageWindow(3, 5)).toEqual([1, 2, 3, 4, 5]);
});

test("keeps the first and the last, and hides the run between", () => {
  // The two a hundred-page list reaches for most are the two ends.
  expect(pageWindow(50, 100)).toEqual([1, "gap", 49, 50, 51, "gap", 100]);
  expect(pageWindow(1, 100)).toEqual([1, 2, "gap", 100]);
  expect(pageWindow(100, 100)).toEqual([1, "gap", 99, 100]);
});

test("draws a one-page gap as the page rather than as an ellipsis", () => {
  // 1 . 3 4 5 . 7 -- both holes are a single page, so both are spelled out.
  expect(pageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  // One page short of that on the left, and the left hole is real.
  expect(pageWindow(5, 8)).toEqual([1, "gap", 4, 5, 6, 7, 8]);
});

test("never leaves the range, however far the window is pushed", () => {
  for (let count = 1; count <= 12; count += 1) {
    for (let page = 1; page <= count; page += 1) {
      const slots = pageWindow(page, count);
      const numbers = slots.filter((s): s is number => s !== "gap");
      expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
      expect(new Set(numbers).size).toBe(numbers.length);
      expect(Math.min(...numbers)).toBe(1);
      expect(Math.max(...numbers)).toBe(count);
      expect(numbers).toContain(page);
      // A gap is only ever a gap: it must never sit at either end, and never
      // stand where the numbers are already consecutive.
      expect(slots[0]).not.toBe("gap");
      expect(slots.at(-1)).not.toBe("gap");
    }
  }
});

test("answers nothing at all when there is only one page", async () => {
  const { container } = await mount(
    <PaginationBar page={1} pageCount={1} onPage={() => {}} labels={labels} />,
  );
  expect(container.querySelector("[data-slot=pagination]")).toBeNull();
});

test("disables the way out of the end you are already on", async () => {
  const { container } = await mount(
    <PaginationBar page={1} pageCount={9} onPage={() => {}} labels={labels} />,
  );
  const at = (label: string) =>
    container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
  expect(at("First page").disabled).toBe(true);
  expect(at("Previous page").disabled).toBe(true);
  expect(at("Next page").disabled).toBe(false);
  expect(at("Last page").disabled).toBe(false);
});

test("is buttons rather than links, so nothing here navigates", async () => {
  // An <a href="#"> would be a real navigation in a file:// window, and it
  // brings a context menu full of verbs that do nothing here.
  const { container } = await mount(
    <PaginationBar page={2} pageCount={9} onPage={() => {}} labels={labels} />,
  );
  expect(container.querySelectorAll("a").length).toBe(0);
  const links = container.querySelectorAll("[data-slot=pagination-link]");
  expect(links.length).toBeGreaterThan(0);
  for (const link of links) {
    expect(link.tagName).toBe("BUTTON");
    expect(link.getAttribute("type")).toBe("button");
  }
  // The page you are on is announced, not merely coloured.
  expect(container.querySelector("[aria-current=page]")?.textContent).toBe("2");
});

test("asks for a page rather than for a direction", async () => {
  const asked: number[] = [];
  const { container, flush } = await mount(
    <PaginationBar
      page={5}
      pageCount={9}
      onPage={(n) => asked.push(n)}
      labels={labels}
    />,
  );
  const at = (label: string) =>
    container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
  await flush(() => at("First page").click());
  await flush(() => at("Previous page").click());
  await flush(() => at("Next page").click());
  await flush(() => at("Last page").click());
  await flush(() => at("Page 4").click());
  expect(asked).toEqual([1, 4, 6, 9, 4]);
});
