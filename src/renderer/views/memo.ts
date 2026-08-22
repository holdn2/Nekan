/**
 * One memo per task, shown in a panel under the matrix.
 *
 * The panel takes its height out of the matrix, the way the brain dump above
 * does, and the whole of that happens in CSS: --memo-h sizes it and the grid
 * shrinks to fit. Nothing here talks to main -- opening a note does not move
 * the window.
 *
 * Which task is selected lives in selection.js, not here: the matrix and the
 * title bar both need to know, and neither of them wants this panel.
 */

import { clampMemo } from "../../shared/core.js";
import { $ } from "../dom.js";
import { t } from "../i18n.js";
import { setMemo } from "../store.js";
import {
  isMemoEditing,
  selectedTask,
  setMemoEditing,
  setSelected,
} from "../selection.js";
import { notify } from "../render-bus.js";

/**
 * Rule for the save button: a new memo needs text, an edit needs text *and* a
 * change. `clampMemo` trims the same way the save path does, so what the button
 * compares is what would be written.
 */
function memoSaveState() {
  const task = selectedTask();
  if (!task) return { value: null, original: null, canSave: false };
  const value = clampMemo($<HTMLTextAreaElement>("#memoInput").value);
  const original = task.memo || null;
  return { value, original, canSave: Boolean(value) && value !== original };
}

/** Enable or disable the save button as the textarea changes. */
function syncMemoSave() {
  $<HTMLButtonElement>("#memoSave").disabled = !memoSaveState().canSave;
}

/** Draw the panel for the selected task, or hide it when there is none. */
export function renderMemo() {
  const panel = $("#memoPanel");
  const task = selectedTask();
  if (!task) {
    panel.classList.add("hidden");
    panel.dataset.key = "";
    // Nobody can see it, but it is the last thing this panel wrote and it is in
    // whatever language was on screen then. Left behind, it is a Korean string
    // sitting in an English document -- invisible to a user and a false hit for
    // the sweep that looks for exactly that. Reopening rewrites it either way.
    $("#memoHint").textContent = "";
    return;
  }
  panel.classList.remove("hidden");

  const memo = task.memo || "";
  const editing = isMemoEditing() || !memo;

  $("#memoTitle").textContent = task.text;
  $("#memoTitle").title = task.text;
  $("#memoDot").className = `dot ${task.quadrant}`;
  $("#memoText").textContent = memo;

  // Only reseed the textarea when the panel actually changes what it is
  // showing; an unrelated re-render must not wipe what is being typed.
  const key = `${task.id}:${editing}`;
  const input = $<HTMLTextAreaElement>("#memoInput");
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
  setMemoEditing(false);
  setMemo(task.id, value);
}

/** Esc / Cancel: back to reading, or close outright if there was nothing yet. */
function cancelMemoEdit() {
  // Nothing to fall back to when the memo is new — close the panel instead.
  if (!selectedTask()?.memo) {
    setSelected(null);
    return;
  }
  setMemoEditing(false);
}

/** Drop the memo but keep the task. Confirmed, because there is no undo. */
function deleteMemo() {
  const task = selectedTask();
  if (!task || !task.memo) return;
  if (!window.confirm(t("memo.confirmDelete"))) return;
  setMemoEditing(false);
  setMemo(task.id, null);
}

/** Bind the panel's own controls. The rows are wired by wireRowSelection. */
export function wireMemo() {
  const input = $<HTMLTextAreaElement>("#memoInput");
  input.addEventListener("input", syncMemoSave);
  input.addEventListener("keydown", (e) => {
    // Same reason as inline-edit: an Escape that cancels an IME composition
    // must not also close the memo. Ctrl+Enter is safe either way, but the
    // guard is the whole handler's, not one branch's.
    if (e.isComposing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      cancelMemoEdit();
    } else if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      saveMemo();
    }
  });

  $("#memoText").addEventListener("dblclick", () => setMemoEditing(true));

  $("#memoSave").addEventListener("click", saveMemo);
  $("#memoCancel").addEventListener("click", cancelMemoEdit);
  $("#memoDelete").addEventListener("click", deleteMemo);
  $("#memoClose").addEventListener("click", () => setSelected(null));
}
