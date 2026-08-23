/**
 * What the strip has to keep doing. Two of these were found by hand in the
 * running app when it moved to React; they are here so they stay found.
 */

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { flush, find, hidden } from "../../react/testing.js";
import { toast } from "../toast.js";

beforeEach(() => {
  vi.useFakeTimers();
  if (!document.getElementById("toastRoot")) {
    const host = document.createElement("div");
    host.id = "toastRoot";
    document.body.append(host);
  }
});

afterEach(() => {
  vi.useRealTimers();
});

test("shows the message it was given", async () => {
  await flush(() => toast("saved"));
  expect(find("#toastText").textContent).toBe("saved");
  expect(hidden("#toast")).toBe(false);
});

test("an error tints it", async () => {
  await flush(() => toast("broken", { error: true }));
  expect(find("#toast").classList.contains("error")).toBe(true);
});

test("the action carries its own label and handler", async () => {
  const onClick = vi.fn();
  await flush(() => toast("saved", { action: { label: "open", onClick } }));
  expect(find("#toastAct").textContent).toBe("open");
  expect(hidden("#toastAct")).toBe(false);
  await flush(() => find("#toastAct").click());
  expect(onClick).toHaveBeenCalledOnce();
});

test("a later toast never keeps the previous action", async () => {
  const stale = vi.fn();
  await flush(() =>
    toast("first", { action: { label: "open", onClick: stale } }),
  );
  await flush(() => toast("second"));
  expect(hidden("#toastAct")).toBe(true);
  await flush(() => find("#toastAct").click());
  expect(stale).not.toHaveBeenCalled();
});

test("it fades rather than disappearing", async () => {
  await flush(() => toast("saved", { ms: 4000 }));
  await flush(() => vi.advanceTimersByTime(4000));
  // Still in the document, still holding its words: .toast.hidden is a
  // transition, and an element React had unmounted could not animate out.
  expect(document.querySelector("#toast")).not.toBeNull();
  expect(find("#toastText").textContent).toBe("saved");
  expect(hidden("#toast")).toBe(true);
});

test("a second toast restarts the clock", async () => {
  await flush(() => toast("first", { ms: 4000 }));
  await flush(() => vi.advanceTimersByTime(3000));
  await flush(() => toast("second", { ms: 4000 }));
  await flush(() => vi.advanceTimersByTime(3000));
  expect(hidden("#toast")).toBe(false);
  await flush(() => vi.advanceTimersByTime(1000));
  expect(hidden("#toast")).toBe(true);
});
