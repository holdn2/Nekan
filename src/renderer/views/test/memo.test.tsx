/**
 * The panel's behaviour, including the two things that only ever showed up in
 * the running app: the note surviving a redraw while it is being typed, and an
 * IME keystroke not being allowed to end the edit.
 */

import { beforeEach, expect, test, vi } from "vitest";
import type { Task } from "../../../shared/types.js";
import { setTasks } from "../../store.js";
import { clearSelectionSilently, setSelected } from "../../selection.js";
import { setLanguage } from "../../i18n.js";
import { find, hidden, mount } from "../../react/testing.js";
import { MemoPanel } from "../memo.js";

const task = (over: Partial<Task> = {}): Task => ({
  id: "t1",
  text: "제목",
  quadrant: "q1",
  space: "work",
  orderKey: "m",
  memo: "원래 메모",
  dueDate: null,
  createdAt: 1,
  updatedAt: 1,
  completedAt: null,
  deletedAt: null,
  purgedAt: null,
  ...over,
});

/** The panel is React's, but the <section> it fills belongs to index.html. */
function host() {
  document.body.replaceChildren();
  const section = document.createElement("section");
  section.id = "memoPanel";
  section.className = "memo hidden";
  document.body.append(section);
  return section;
}

const type = (el: HTMLTextAreaElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

beforeEach(() => {
  // Saving goes through main. Nothing here is testing that it arrives.
  (window as unknown as { api: { save: unknown } }).api = { save: vi.fn() };
  clearSelectionSilently();
  setLanguage("en");
});

test("draws nothing, and hides the section, with no selection", async () => {
  const section = host();
  setTasks([task()]);
  const { container } = await mount(<MemoPanel />, section);
  expect(container.childElementCount).toBe(0);
  expect(section.classList.contains("hidden")).toBe(true);
});

test("shows the selected task and its note, reading first", async () => {
  const section = host();
  setTasks([task()]);
  const { flush } = await mount(<MemoPanel />, section);
  await flush(() => setSelected("t1"));

  expect(section.classList.contains("hidden")).toBe(false);
  expect(find("#memoTitle").textContent).toBe("제목");
  expect(find("#memoText").textContent).toBe("원래 메모");
  // The quadrant, not the whole class list: the rest of it is how the dot is
  // drawn, which components/dot.tsx owns and is free to change.
  expect(find("#memoDot").classList.contains("q1")).toBe(true);
  expect(hidden("#memoInput")).toBe(true);
  // The close button is drawn, not typed -- an x character sits below centre.
  expect(document.querySelector("#memoClose svg")).not.toBeNull();
  expect(find("#memoClose").getAttribute("aria-label")).toBeTruthy();
});

test("a task with no note opens straight into the editor", async () => {
  const section = host();
  setTasks([task({ memo: null })]);
  const { flush } = await mount(<MemoPanel />, section);
  await flush(() => setSelected("t1"));
  expect(hidden("#memoInput")).toBe(false);
});

test("saving writes the note and goes back to reading", async () => {
  const section = host();
  setTasks([task()]);
  const { flush } = await mount(<MemoPanel />, section);
  await flush(() => setSelected("t1"));
  await flush(() =>
    find("#memoText").dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true }),
    ),
  );

  const input = find<HTMLTextAreaElement>("#memoInput");
  expect(input.value).toBe("원래 메모");
  expect(find<HTMLButtonElement>("#memoSave").disabled).toBe(true);

  await flush(() => type(input, "고쳐 쓴 메모"));
  expect(find<HTMLButtonElement>("#memoSave").disabled).toBe(false);

  await flush(() => find("#memoSave").click());
  expect(hidden("#memoInput")).toBe(true);
  expect(find("#memoText").textContent).toBe("고쳐 쓴 메모");
});

test("an IME keystroke does not end the edit", async () => {
  const section = host();
  setTasks([task()]);
  const { flush } = await mount(<MemoPanel />, section);
  await flush(() => setSelected("t1"));
  await flush(() =>
    find("#memoText").dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true }),
    ),
  );

  const input = find<HTMLTextAreaElement>("#memoInput");
  await flush(() =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(hidden("#memoInput")).toBe(false);

  // The same key, not composing, is the one that means cancel.
  await flush(() =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(hidden("#memoInput")).toBe(true);
});

test("a redraw mid-sentence keeps what is being typed", async () => {
  const section = host();
  setTasks([task()]);
  const { flush } = await mount(<MemoPanel />, section);
  await flush(() => setSelected("t1"));
  await flush(() =>
    find("#memoText").dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true }),
    ),
  );
  await flush(() => type(find<HTMLTextAreaElement>("#memoInput"), "쓰던 중"));

  // A language change is a redraw of everything -- the words follow it, and
  // the half-written note must not.
  await flush(() => setLanguage("ko"));
  expect(find<HTMLTextAreaElement>("#memoInput").value).toBe("쓰던 중");
  expect(find("#memoSave").textContent).toBe("저장");
});
