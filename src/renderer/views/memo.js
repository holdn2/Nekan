/**
 * One memo per task, shown in a panel under the matrix.
 *
 * The panel is extra window height, not a slice of the matrix: opening it asks
 * main.js to grow the window by --memo-h and closing it hands exactly that
 * back, so the quadrant ratios the user dragged never move. That is also why
 * the height is read from CSS here instead of being a number in JS — the
 * stylesheet and the window accounting cannot drift if there is only one value.
 *
 * Selection lives here too, because "which task is selected" only ever means
 * "whose memo is open".
 */

import { INBOX, clampMemo } from "../core-bridge.js";
import { $ } from "../dom.js";
import { t } from "../i18n.js";
import { findTask, inSpace, setMemo } from "../store.js";
import { notify } from "../render-bus.js";

let selectedId = null;
/** Whether the textarea is up. A task with no memo yet always starts there. */
let memoEditing = false;
/** Long enough for the second click of a double-click to arrive first. */
const CLICK_DELAY = 220;
let clickTimer = null;

/** Does this row get the selected styling? */
export const isSelected = (id) => id === selectedId;

/**
 * Click selects for the memo panel, double-click edits the text — so a single
 * click has to wait out the double-click window before it acts. Without the
 * wait, a double-click would toggle the selection twice and the window would
 * grow and shrink under the cursor.
 */
export function wireRowSelection(li, textEl, task) {
  li.addEventListener("click", (e) => {
    if (e.detail > 1) return;
    if (e.target.closest("button, .duebox")) return;
    if (textEl.isContentEditable) return;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(
      () => setSelected(isSelected(task.id) ? null : task.id),
      CLICK_DELAY,
    );
  });
  li.addEventListener("dblclick", () => clearTimeout(clickTimer));
}

/** Panel height comes from CSS so main.js and the stylesheet cannot drift. */
const memoPanelHeight = () =>
  Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--memo-h"),
  ) || 0;

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

/** Only the open/closed transition resizes; swapping tasks keeps the height. */
export function setSelected(id) {
  if (id === selectedId) return;
  const wasOpen = selectedId !== null;
  selectedId = id;
  memoEditing = false;
  if (wasOpen !== (id !== null)) {
    window.api.setMemoPanel(id !== null, memoPanelHeight());
  }
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
  window.api.setMemoPanel(false, 0);
}

/**
 * Forget the selection *without* asking for a resize — for the trip to bar
 * mode, where collapse() has already taken the panel's height off the window.
 */
export function clearSelectionSilently() {
  selectedId = null;
  memoEditing = false;
}

/**
 * Rule for the save button: a new memo needs text, an edit needs text *and* a
 * change. `clampMemo` trims the same way the save path does, so what the button
 * compares is what would be written.
 */
function memoSaveState() {
  const task = selectedTask();
  if (!task) return { value: null, original: null, canSave: false };
  const value = clampMemo($("#memoInput").value);
  const original = task.memo || null;
  return { value, original, canSave: Boolean(value) && value !== original };
}

/** Enable/disable 저장 as the textarea changes. */
function syncMemoSave() {
  $("#memoSave").disabled = !memoSaveState().canSave;
}

/** Draw the panel for the selected task, or hide it when there is none. */
export function renderMemo() {
  const panel = $("#memoPanel");
  const task = selectedTask();
  if (!task) {
    panel.classList.add("hidden");
    panel.dataset.key = "";
    return;
  }
  panel.classList.remove("hidden");

  const memo = task.memo || "";
  const editing = memoEditing || !memo;

  $("#memoTitle").textContent = task.text;
  $("#memoTitle").title = task.text;
  $("#memoDot").className = `dot ${task.quadrant}`;
  $("#memoText").textContent = memo;

  // Only reseed the textarea when the panel actually changes what it is
  // showing; an unrelated re-render must not wipe what is being typed.
  const key = `${task.id}:${editing}`;
  const input = $("#memoInput");
  if (panel.dataset.key !== key) {
    panel.dataset.key = key;
    if (editing) {
      input.value = memo;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  input.classList.toggle("hidden", !editing);
  $("#memoText").classList.toggle("hidden", editing);
  $("#memoSave").classList.toggle("hidden", !editing);
  $("#memoCancel").classList.toggle("hidden", !editing || !memo);
  $("#memoDelete").classList.toggle("hidden", editing || !memo);
  $("#memoHint").textContent = t(editing ? "memo.editing" : "memo.edit");
  syncMemoSave();
}

/** Write the textarea to the task. The store's commit redraws the row. */
function saveMemo() {
  const task = selectedTask();
  const { value, canSave } = memoSaveState();
  if (!task || !canSave) return;
  memoEditing = false;
  setMemo(task.id, value);
}

/** Esc / Cancel: back to reading, or close outright if there was nothing yet. */
function cancelMemoEdit() {
  // Nothing to fall back to when the memo is new — close the panel instead.
  if (!selectedTask()?.memo) {
    setSelected(null);
    return;
  }
  memoEditing = false;
  renderMemo();
}

/** Drop the memo but keep the task. Confirmed, because there is no undo. */
function deleteMemo() {
  const task = selectedTask();
  if (!task || !task.memo) return;
  if (!window.confirm(t("memo.confirmDelete"))) return;
  memoEditing = false;
  setMemo(task.id, null);
}

/** Bind the panel's own controls. The rows are wired by wireRowSelection. */
export function wireMemo() {
  const input = $("#memoInput");
  input.addEventListener("input", syncMemoSave);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelMemoEdit();
    } else if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      saveMemo();
    }
  });

  $("#memoText").addEventListener("dblclick", () => {
    memoEditing = true;
    renderMemo();
  });

  $("#memoSave").addEventListener("click", saveMemo);
  $("#memoCancel").addEventListener("click", cancelMemoEdit);
  $("#memoDelete").addEventListener("click", deleteMemo);
  $("#memoClose").addEventListener("click", () => setSelected(null));
}
