/**
 * The three lines every component test would otherwise repeat.
 *
 * Deliberately not @testing-library/react. What its queries buy is a way to
 * look at a component the way a user does, and this codebase already checks
 * the other way -- by id and class, because that is what the fifteen
 * stylesheets and the CDP checks in CLAUDE.md name. One vocabulary is worth
 * more here than a better one nobody else uses.
 *
 * act() is the whole point: React batches, so an update queued by a click is
 * not in the document until React has been let run. Without it a test reads
 * the DOM one render too early and fails in a way that looks like a bug in the
 * component.
 */

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

interface Mounted {
  /** Where the component was rendered. */
  container: HTMLElement;
  /** Run something and let React finish before returning. */
  flush: (fn?: () => void) => Promise<void>;
  unmount: () => void;
}

/**
 * Containers mount() has made, so the next test does not find the last one's
 * elements. Without this, find(".text") in the second test of a file answers
 * with the first test's node -- which reads as the component not reacting, and
 * cost an hour once.
 */
const mounted = new Set<{
  root: Root;
  container: HTMLElement;
  owned: boolean;
}>();

function clearPrevious() {
  for (const entry of mounted) {
    act(() => entry.root.unmount());
    if (entry.owned) entry.container.remove();
  }
  mounted.clear();
}

/**
 * Render `element` and wait for React.
 *
 * Into `into` when the component is one that fills an element index.html
 * already owns -- the memo panel is a flex child the layout measures, so a test
 * that renders it somewhere else is testing a different arrangement.
 */
export async function mount(
  element: ReactElement,
  into?: HTMLElement,
): Promise<Mounted> {
  clearPrevious();
  const container = into ?? document.createElement("div");
  if (!into) document.body.append(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(element);
  });
  mounted.add({ root, container, owned: !into });

  return {
    container,
    flush: async (fn?: () => void) => {
      await act(async () => {
        fn?.();
      });
    },
    unmount: () => clearPrevious(),
  };
}

/**
 * Let React finish whatever `fn` queued.
 *
 * For components that mount themselves rather than being handed to mount() --
 * the toast puts its own root into the document the first time it is raised.
 */
export async function flush(fn?: () => void) {
  await act(async () => {
    fn?.();
  });
}

/** `document.querySelector`, but a failure says which selector missed. */
export function find<T extends HTMLElement = HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matched ${selector}`);
  return el;
}

/** Is it on screen? These components hide by class, never by unmounting. */
export const hidden = (selector: string) =>
  find(selector).classList.contains("hidden");
