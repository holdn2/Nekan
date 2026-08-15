/**
 * "다 꺼내기" — the staging list above the matrix, where a task is written down
 * before anyone decides what it is.
 *
 * Two things set it apart from the quadrants:
 *   - its rows carry less (no due chip, no complete, no memo), because those
 *     controls only start to mean something once a task has a quadrant;
 *   - it is folded by default and, unlike the memo panel, it does *not* grow
 *     the window — it takes its height from the matrix. That is why the list is
 *     capped in CSS (--inbox-max-h) and scrolls past it: an unbounded staging
 *     list would push the quadrants off the bottom of a small window.
 */

import { INBOX, splitBulkText } from "../core-bridge.js";
import { $, numEl } from "../dom.js";
import { closeIcon, plusIcon } from "../components/icons.js";
import { t } from "../i18n.js";
import { addTask, addTasks, deleteTask, inboxTasks } from "../store.js";
import { startEdit } from "./inline-edit.js";

/** Matches the row's fade-out in styles.css. */
const REMOVE_MS = 160;

let inboxOpen = false;

/**
 * An inbox row: number, text, delete. Double-click still edits the text and ×
 * still soft-deletes — sorting out *what* a task is comes after getting it out
 * of your head, and dragging it into a quadrant is what does that.
 */
function inboxItemEl(task, index) {
  const li = document.createElement("li");
  li.className = "item inbox-item";
  li.dataset.id = task.id;
  li.draggable = true;

  const text = document.createElement("span");
  text.className = "text";
  text.textContent = task.text;
  text.title = t("item.hintInbox");
  text.addEventListener("dblclick", () => startEdit(li, text, task));

  const del = document.createElement("button");
  del.className = "del";
  del.append(closeIcon());
  del.title = t("item.delete");
  del.setAttribute("aria-label", t("item.deleteLabel", { text: task.text }));
  del.addEventListener("click", () => {
    del.disabled = true;
    li.classList.add("removing");
    setTimeout(() => deleteTask(task.id), REMOVE_MS);
  });

  li.append(numEl(index), text, del);
  return li;
}

/** Redraw the staging list and the count beside its header. */
export function renderInbox() {
  const items = inboxTasks();
  $("#inboxList").replaceChildren(...items.map((t, i) => inboxItemEl(t, i)));
  $("#inboxCount").textContent = String(items.length);
}

/**
 * Fold or unfold the panel. `persist` is false while restoring the saved state
 * at startup, so replaying it does not write it straight back.
 */
export function applyInboxOpen(open, persist = true) {
  inboxOpen = Boolean(open);
  $("#inboxPanel").classList.toggle("open", inboxOpen);
  $("#inboxToggle").setAttribute("aria-expanded", String(inboxOpen));
  if (persist) window.api.setInboxOpen(inboxOpen);
}

/** Unfold and put the caret in the box — what Ctrl+0 does. */
export function focusInbox() {
  applyInboxOpen(true);
  $("#inboxInput").focus();
}

/** Header toggle, the add form, and the paste-a-list shortcut. */
export function wireInbox() {
  const input = $("#inboxInput");

  $("#inboxToggle").addEventListener("click", () => {
    applyInboxOpen(!inboxOpen);
    if (inboxOpen) input.focus();
  });

  $('#inboxAdd button[type="submit"]').replaceChildren(plusIcon());
  $("#inboxAdd").addEventListener("submit", (e) => {
    e.preventDefault();
    addTask(INBOX, input.value, null);
    input.value = "";
    input.focus();
  });

  // Most brain dumps are already written down somewhere else. Pasting a block
  // of lines should give one item per line, not a single item with newlines
  // flattened into it.
  input.addEventListener("paste", (e) => {
    const raw = e.clipboardData?.getData("text") ?? "";
    if (!raw.includes("\n")) return;
    e.preventDefault();
    // Splice the paste into whatever is already typed before cutting on
    // newlines, so a half-finished line in the box becomes the first item
    // instead of being silently dropped.
    const merged =
      input.value.slice(0, input.selectionStart) +
      raw +
      input.value.slice(input.selectionEnd);
    addTasks(INBOX, splitBulkText(merged));
    input.value = "";
  });
}
