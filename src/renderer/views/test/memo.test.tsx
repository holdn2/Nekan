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
import { classCompiled } from "../../components/ui/test/compiled-css.js";
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

/** Open the panel on a task and get it into the editor. */
async function edit(flush: (fn?: () => void) => Promise<void>) {
  await flush(() => setSelected("t1"));
  await flush(() =>
    find("#memoText").dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true }),
    ),
  );
}

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

test("the editor is the ported textarea, sized by the panel and not by itself", async () => {
  const section = host();
  setTasks([task()]);
  const { flush } = await mount(<MemoPanel />, section);
  await edit(flush);

  const input = find<HTMLTextAreaElement>("#memoInput");
  expect(input.getAttribute("data-slot")).toBe("textarea");
  // The port floors at 64px and grows with its content. Both are overridden,
  // because the panel's height is dragged from its top edge and this field has
  // to follow it down -- see the comment on the element. cn() has to actually
  // have dropped the port's versions rather than appended ours after them.
  expect(input.className).not.toContain("min-h-[64px]");
  expect(input.className).not.toContain("field-sizing-content");
  // And what replaced them has to be classes Tailwind emitted rules for -- a
  // className is only a string until the build agrees (see compiled-css.tsx).
  for (const cls of [
    "min-h-[0px]",
    "field-sizing-fixed",
    "text-md",
    "border-line-strong",
    "focus-visible:border-accent",
  ]) {
    expect(input.className).toContain(cls);
    expect(classCompiled(cls)).toBe(true);
  }
  // The port's own ring would draw a second outline behind the accent glow this
  // field has always had, so it is switched off rather than left to stack.
  expect(input.className).toContain("focus-visible:ring-0");
  expect(input.className).not.toContain("focus-visible:ring-3");
});

test("deleting a note asks inside the app, and only deletes on yes", async () => {
  const section = host();
  setTasks([task()]);
  // If the old path survived anywhere, this stub answers no and the note would
  // stay -- so the assertions below tell the two apart rather than trusting the
  // spy alone.
  const confirm = vi.fn(() => false);
  (window as unknown as { confirm: unknown }).confirm = confirm;

  const { flush } = await mount(<MemoPanel />, section);
  await flush(() => setSelected("t1"));

  // Nothing is asking yet.
  expect(document.querySelector("#memoDeleteConfirm")).toBeNull();

  await flush(() => find("#memoDelete").click());
  expect(confirm).not.toHaveBeenCalled();
  const dialog = find("#memoDeleteConfirm");
  expect(dialog.getAttribute("role")).toBe("alertdialog");
  expect(find('[data-slot="alert-dialog-title"]').textContent).toBe(
    "Delete this note? This cannot be undone.",
  );

  // Backing out leaves the note alone.
  await flush(() => find("#memoDeleteNo").click());
  expect(document.querySelector("#memoDeleteConfirm")).toBeNull();
  expect(find("#memoText").textContent).toBe("원래 메모");

  // Saying yes is the only thing that removes it.
  await flush(() => find("#memoDelete").click());
  await flush(() => find("#memoDeleteYes").click());
  expect(document.querySelector("#memoDeleteConfirm")).toBeNull();
  // No note left means the panel opens straight into an empty editor.
  expect(hidden("#memoInput")).toBe(false);
  expect(find<HTMLTextAreaElement>("#memoInput").value).toBe("");
  expect(confirm).not.toHaveBeenCalled();
});
