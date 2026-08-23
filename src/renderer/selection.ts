/**
 * Which task the memo panel is pointing at.
 *
 * This used to live inside views/memo, which meant the matrix imported a view
 * to ask whether a row was selected and the title bar imported a view to clear
 * the selection when it folded the window. Neither of them wants the panel —
 * they want the state — and a view importing another view for state is how a
 * graph stops having a direction.
 *
 * It is deliberately not React state, for the same reason the task store is
 * not: the matrix rows that read it are still built by hand, and both readers
 * find out the same way, through render-bus.
 */

import { INBOX } from "../shared/core.js";
import type { Task } from "../shared/types.js";
import { findTask, inSpace } from "./store.js";
import { notify } from "./render-bus.js";

let selectedId: string | null = null;
/** Whether the textarea is up. A task with no memo yet always starts there. */
let memoEditing = false;
/** Long enough for the second click of a double-click to arrive first. */
const CLICK_DELAY = 220;
let clickTimer: ReturnType<typeof setTimeout> | null = null;

/** Does this row get the selected styling? */
export const isSelected = (id: string) => id === selectedId;

/** Whether the panel is showing its editor rather than the note. */
export const isMemoEditing = () => memoEditing;

/** Switch the panel between reading and editing. Redraws. */
export function setMemoEditing(next: boolean) {
  if (next === memoEditing) return;
  memoEditing = next;
  notify();
}

/**
 * Click selects for the memo panel, double-click edits the text — so a single
 * click has to wait out the double-click window before it acts. Without the
 * wait, a double-click would toggle the selection twice and the window would
 * grow and shrink under the cursor.
 */
export function wireRowSelection(
  li: HTMLElement,
  textEl: HTMLElement,
  task: Task,
) {
  li.addEventListener("click", (e: MouseEvent) => {
    if (e.detail > 1) return;
    if ((e.target as HTMLElement).closest("button, .duebox")) return;
    if (textEl.isContentEditable) return;
    if (clickTimer) clearTimeout(clickTimer);
    clickTimer = setTimeout(
      () => setSelected(isSelected(task.id) ? null : task.id),
      CLICK_DELAY,
    );
  });
  li.addEventListener("dblclick", () => {
    if (clickTimer) clearTimeout(clickTimer);
  });
}

/**
 * The selected task, or null once it has left the matrix on screen. Being
 * dragged up to the inbox counts as leaving (those rows have no memo), and so
 * does switching to the other board — in both cases the panel closes itself
 * rather than pointing at something the list no longer shows.
 */
export function selectedTask() {
  if (!selectedId) return null;
  const task = findTask(selectedId);
  if (!task || task.purgedAt || task.completedAt || task.deletedAt) return null;
  // The INBOX test cannot be folded into inSpace(): an inbox row has
  // `space: null`, which inSpace() passes on purpose so the staging list is
  // shared by both boards. Dropping it here would leave the panel open on a row
  // that has no memo to show.
  if (task.quadrant === INBOX || !inSpace(task)) return null;
  return task;
}

export function setSelected(id: string | null) {
  if (id === selectedId) return;
  selectedId = id;
  memoEditing = false;
  notify();
}

/**
 * Completing, trashing or purging the selected task takes the panel with it.
 * Called at the top of every render, before anything is drawn from it.
 */
export function dropStaleSelection() {
  if (!selectedId || selectedTask()) return;
  selectedId = null;
  memoEditing = false;
}

/** Forget the selection without drawing: the bar has no panel to show it in. */
export function clearSelectionSilently() {
  selectedId = null;
  memoEditing = false;
}
