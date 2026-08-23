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
  const container = into ?? document.createElement("div");
  if (!into) document.body.append(container);
  let root: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(element);
  });

  return {
    container,
    flush: async (fn?: () => void) => {
      await act(async () => {
        fn?.();
      });
    },
    unmount: () => {
      act(() => root.unmount());
      if (!into) container.remove();
    },
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
