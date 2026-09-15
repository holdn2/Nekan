/**
 * The panel's behaviour, including the two things that only ever showed up in
 * the running app: the note surviving a redraw while it is being typed, and an
 * IME keystroke not being allowed to end the edit.
 */

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Task } from "../../../shared/types.js";
import { DRAFT_SAVE_MS } from "../../../shared/core.js";
import { findTask, setTasks } from "../../store.js";
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
  stateAt: over.stateAt ?? over.updatedAt ?? 1,
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

afterEach(() => {
  vi.useRealTimers();
});

/** What the store holds for the task -- what a restart would read back. */
const stored = (id = "t1") => findTask(id)?.memo ?? null;

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
  // Save does not wait for a change any more: a pause may already have written
  // the text, and the button is then how the editing ends.
  expect(find<HTMLButtonElement>("#memoSave").disabled).toBe(false);

  await flush(() => type(input, "고쳐 쓴 메모"));
  expect(find<HTMLButtonElement>("#memoSave").disabled).toBe(false);

  await flush(() => find("#memoSave").click());
  expect(hidden("#memoInput")).toBe(true);
  expect(find("#memoText").textContent).toBe("고쳐 쓴 메모");
});

test("a pause writes the note, and the editor stays open", async () => {
  vi.useFakeTimers();
  const section = host();
  setTasks([task()]);
  const { flush } = await mount(<MemoPanel />, section);
  await edit(flush);

  await flush(() => type(find<HTMLTextAreaElement>("#memoInput"), "쓰는 중"));
  await flush(() => vi.advanceTimersByTime(DRAFT_SAVE_MS - 1));
  expect(stored()).toBe("원래 메모");

  await flush(() => vi.advanceTimersByTime(1));
  expect(stored()).toBe("쓰는 중");
  expect(hidden("#memoInput")).toBe(false);
});

test("the first write to a task with no note does not flip the panel to reading", async () => {
  // It opened in the editor because it had no note. Once a pause gives it one,
  // "no note" is no longer why it is editing, and the field would vanish under
  // the cursor unless the panel says it still is.
  vi.useFakeTimers();
  const section = host();
  setTasks([task({ memo: null })]);
  const { flush } = await mount(<MemoPanel />, section);
  await flush(() => setSelected("t1"));

  await flush(() => type(find<HTMLTextAreaElement>("#memoInput"), "첫 메모"));
  await flush(() => vi.advanceTimersByTime(DRAFT_SAVE_MS));
  expect(stored()).toBe("첫 메모");
  expect(hidden("#memoInput")).toBe(false);
  expect(find<HTMLTextAreaElement>("#memoInput").value).toBe("첫 메모");
});

test.each([
  ["another task is clicked", () => setSelected("t2")],
  ["the panel is closed", () => find("#memoClose").click()],
  ["the window folds to the bar", () => clearSelectionSilently()],
])("what was typed is written at once when %s", async (_, leave) => {
  // No timers advanced: leaving must not depend on a pause having happened.
  const section = host();
  setTasks([
    task(),
    task({ id: "t2", text: "다른 일", orderKey: "n", memo: null }),
  ]);
  const { flush } = await mount(<MemoPanel />, section);
  await edit(flush);

  await flush(() =>
    type(find<HTMLTextAreaElement>("#memoInput"), "안 누르고 떠남"),
  );
  await flush(leave);
  expect(stored()).toBe("안 누르고 떠남");
  expect(stored("t2")).toBe(null);
});

test("half a syllable is not written while an IME is composing", async () => {
  vi.useFakeTimers();
  const section = host();
  setTasks([task()]);
  const { flush } = await mount(<MemoPanel />, section);
  await edit(flush);

  const input = find<HTMLTextAreaElement>("#memoInput");
  await flush(() =>
    input.dispatchEvent(new Event("compositionstart", { bubbles: true })),
  );
  await flush(() => type(input, "하"));
  await flush(() => vi.advanceTimersByTime(DRAFT_SAVE_MS * 3));
  expect(stored()).toBe("원래 메모");

  await flush(() => type(input, "한"));
  await flush(() =>
    input.dispatchEvent(new Event("compositionend", { bubbles: true })),
  );
  await flush(() => vi.advanceTimersByTime(DRAFT_SAVE_MS));
  expect(stored()).toBe("한");
});

test("a timer from the last syllable does not write the next one half-built", async () => {
  // Korean ends a syllable and starts the next back to back, so a pause timer
  // started by the first is still running when the second begins composing.
  vi.useFakeTimers();
  const section = host();
  setTasks([task()]);
  const { flush } = await mount(<MemoPanel />, section);
  await edit(flush);

  const input = find<HTMLTextAreaElement>("#memoInput");
  const compose = (kind: string) =>
    flush(() => input.dispatchEvent(new Event(kind, { bubbles: true })));
  await compose("compositionstart");
  await flush(() => type(input, "한"));
  await compose("compositionend");
  await compose("compositionstart");
  await flush(() => type(input, "한ㄱ"));
  await flush(() => vi.advanceTimersByTime(DRAFT_SAVE_MS * 2));
  expect(stored()).toBe("원래 메모");
});

test("cancel leaves a note that another device changed alone", async () => {
  // The editor was opened and nothing was typed; meanwhile a sync brought
  // another device's edit. Cancel must not write the old text back over it.
  const section = host();
  setTasks([task()]);
  const { flush } = await mount(<MemoPanel />, section);
  await edit(flush);

  findTask("t1")!.memo = "다른 기기에서 고침";
  await flush(() =>
    find<HTMLTextAreaElement>("#memoInput").dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(stored()).toBe("다른 기기에서 고침");
});

test("the cancel button does not appear under the cursor on an empty note's first write", async () => {
  vi.useFakeTimers();
  const section = host();
  setTasks([task({ memo: null })]);
  const { flush } = await mount(<MemoPanel />, section);
  await flush(() => setSelected("t1"));
  expect(hidden("#memoCancel")).toBe(true);

  await flush(() => type(find<HTMLTextAreaElement>("#memoInput"), "첫 메모"));
  await flush(() => vi.advanceTimersByTime(DRAFT_SAVE_MS));
  expect(stored()).toBe("첫 메모");
  expect(hidden("#memoCancel")).toBe(true);
});

test("an emptied field is never written, by a pause or by leaving", async () => {
  // Deleting a note asks first. Clearing the field to start over and stopping
  // to think is not that question answered.
  vi.useFakeTimers();
  const section = host();
  setTasks([task()]);
  const { flush } = await mount(<MemoPanel />, section);
  await edit(flush);

  await flush(() => type(find<HTMLTextAreaElement>("#memoInput"), "   "));
  await flush(() => vi.advanceTimersByTime(DRAFT_SAVE_MS));
  expect(stored()).toBe("원래 메모");

  await flush(() => setSelected(null));
  expect(stored()).toBe("원래 메모");
});

test("cancel puts back the note as it was when the editor opened", async () => {
  vi.useFakeTimers();
  const section = host();
  setTasks([task()]);
  const { flush } = await mount(<MemoPanel />, section);
  await edit(flush);

  const input = find<HTMLTextAreaElement>("#memoInput");
  await flush(() => type(input, "바꿔 봄"));
  await flush(() => vi.advanceTimersByTime(DRAFT_SAVE_MS));
  expect(stored()).toBe("바꿔 봄");

  await flush(() =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(stored()).toBe("원래 메모");
  expect(hidden("#memoInput")).toBe(true);
  expect(find("#memoText").textContent).toBe("원래 메모");
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
  // The accent focus is the port's own now rather than a hand-rolled shadow
  // here, so there is one outline instead of two. This pins that the glow is
  // still the accent and not the neutral --ring the port shipped with.
  expect(input.className).toContain("focus-visible:ring-accent-soft");
  expect(input.className).not.toContain("focus-visible:ring-ring");
  expect(input.className).not.toContain(
    "shadow-[0_0_0_2px_var(--accent-soft)]",
  );
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

test("cancelling the delete question puts focus back on the button that asked", async () => {
  // The dialog is opened from state, so it has no AlertDialogTrigger for Radix
  // to hand focus back to. Without something saying where it goes, Cancel and
  // Escape both drop it on <body> and a keyboard loses its place in the panel.
  const section = host();
  setTasks([task()]);
  const { flush } = await mount(<MemoPanel />, section);
  await flush(() => setSelected("t1"));

  const remove = find<HTMLButtonElement>("#memoDelete");
  await flush(() => {
    remove.focus();
    remove.click();
  });
  expect(find("#memoDeleteConfirm").contains(document.activeElement)).toBe(
    true,
  );

  await flush(() => find<HTMLButtonElement>("#memoDeleteNo").click());
  expect(document.querySelector("#memoDeleteConfirm")).toBeNull();
  expect(document.activeElement).toBe(remove);
});
