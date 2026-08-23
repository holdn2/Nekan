/**
 * Editing text where it sits. Four of these are the difference between an
 * editor and a trap: Escape has to put the old text back, a blur has to keep
 * the new one, an IME keystroke must not count as either, and the row must
 * stop being draggable while there is a selection in it.
 */

import { expect, test, vi } from "vitest";
import { find, mount } from "../../react/testing.js";
import { EditableText } from "../editable-text.js";

const dbl = () =>
  find(".text").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

const key = (name: string, composing = false) =>
  find(".text").dispatchEvent(
    new KeyboardEvent("keydown", {
      key: name,
      isComposing: composing,
      bubbles: true,
      cancelable: true,
    }),
  );

test("double-click opens an editor with the text in it", async () => {
  const { flush } = await mount(
    <EditableText value="원래" onCommit={vi.fn()} />,
  );
  expect(find(".text").isContentEditable).toBe(false);
  await flush(dbl);
  expect(find(".text").isContentEditable).toBe(true);
  expect(find(".text").textContent).toBe("원래");
});

test("Enter keeps the typing", async () => {
  const onCommit = vi.fn();
  const { flush } = await mount(
    <EditableText value="원래" onCommit={onCommit} />,
  );
  await flush(dbl);
  find(".text").textContent = "고침";
  await flush(() => key("Enter"));
  expect(onCommit).toHaveBeenCalledWith("고침");
  expect(find(".text").isContentEditable).toBe(false);
});

test("Escape puts the old text back and commits nothing", async () => {
  const onCommit = vi.fn();
  const { flush } = await mount(
    <EditableText value="원래" onCommit={onCommit} />,
  );
  await flush(dbl);
  find(".text").textContent = "버릴 글";
  await flush(() => key("Escape"));
  expect(onCommit).not.toHaveBeenCalled();
  expect(find(".text").textContent).toBe("원래");
});

test("an IME keystroke finishes nothing", async () => {
  const onCommit = vi.fn();
  const { flush } = await mount(
    <EditableText value="원래" onCommit={onCommit} />,
  );
  await flush(dbl);
  find(".text").textContent = "한";
  await flush(() => key("Enter", true));
  expect(find(".text").isContentEditable).toBe(true);
  expect(onCommit).not.toHaveBeenCalled();
  await flush(() => key("Escape", true));
  expect(find(".text").isContentEditable).toBe(true);
});

test("clicking away keeps the typing", async () => {
  const onCommit = vi.fn();
  const { flush } = await mount(
    <EditableText value="원래" onCommit={onCommit} />,
  );
  await flush(dbl);
  find(".text").textContent = "고침";
  // A real blur, not a synthesised one: React listens for focusout at the
  // root, and a "blur" event dispatched by hand never reaches it.
  await flush(() => find(".text").blur());
  expect(onCommit).toHaveBeenCalledWith("고침");
});

test("the row cannot be dragged while its text is being edited", async () => {
  const setDraggable = vi.fn();
  const { flush } = await mount(
    <EditableText
      value="원래"
      onCommit={vi.fn()}
      setDraggable={setDraggable}
    />,
  );
  await flush(dbl);
  expect(setDraggable).toHaveBeenLastCalledWith(false);
  await flush(() => key("Enter"));
  expect(setDraggable).toHaveBeenLastCalledWith(true);
});

test("text that did not change is not written back", async () => {
  const onCommit = vi.fn();
  const { flush } = await mount(
    <EditableText value="원래" onCommit={onCommit} />,
  );
  await flush(dbl);
  await flush(() => key("Enter"));
  expect(onCommit).not.toHaveBeenCalled();
});
