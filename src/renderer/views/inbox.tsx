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

import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { INBOX, splitBulkText } from "../../shared/core.js";
import type { Task } from "../../shared/types.js";
import { $ } from "../dom.js";
import { t } from "../i18n.js";
import {
  addTask,
  addTasks,
  deleteTask,
  editTask,
  inboxTasks,
} from "../store.js";
import { notify } from "../render-bus.js";
import { EditableText } from "../components/editable-text.js";
import { plusIcon } from "../components/icons.js";
import { CloseIcon } from "../react/icons.js";
import { useRenderSignal } from "../react/use-store.js";

/** Matches the row's fade-out in styles.css. */
const REMOVE_MS = 160;

let inboxOpen = false;

/**
 * Fold or unfold the panel. `persist` is false while restoring the saved state
 * at startup, so replaying it does not write it straight back.
 *
 * Stays imperative because the panel it toggles is index.html's -- the header,
 * the toggle button and the CSS variable that sizes the list all live outside
 * what React draws here.
 */
export function applyInboxOpen(open: boolean, persist = true) {
  inboxOpen = Boolean(open);
  $("#inboxPanel").classList.toggle("open", inboxOpen);
  $("#inboxToggle").setAttribute("aria-expanded", String(inboxOpen));
  if (persist) window.api.setInboxOpen(inboxOpen);
}

/** Unfold and put the caret in the box — what Ctrl+0 does. */
export function focusInbox() {
  applyInboxOpen(true);
  $<HTMLInputElement>("#inboxInput").focus();
}

/**
 * An inbox row: number, text, delete. Double-click still edits the text and ×
 * still soft-deletes — sorting out *what* a task is comes after getting it out
 * of your head, and dragging it into a quadrant is what does that.
 */
function InboxRow({ task, index }: { task: Task; index: number }) {
  const li = useRef<HTMLLIElement>(null);
  const [removing, setRemoving] = useState(false);

  return (
    <li
      ref={li}
      className={`item inbox-item${removing ? " removing" : ""}`}
      data-id={task.id}
      draggable
    >
      <span className="num">{index + 1}.</span>
      <EditableText
        value={task.text}
        title={t("item.hintInbox")}
        setDraggable={(on) => {
          if (li.current) li.current.draggable = on;
        }}
        onCommit={(text) => {
          editTask(task.id, text);
          // editTask saves without redrawing, and an emptied row is a deleted
          // one -- the list has to hear about both.
          notify();
        }}
      />
      <button
        className="del"
        type="button"
        title={t("item.delete")}
        aria-label={t("item.deleteLabel", { text: task.text })}
        disabled={removing}
        onClick={() => {
          // The row fades before it goes; the store hears about it when the
          // animation is over.
          setRemoving(true);
          setTimeout(() => deleteTask(task.id), REMOVE_MS);
        }}
      >
        <CloseIcon />
      </button>
    </li>
  );
}

function InboxList() {
  useRenderSignal();
  const items = inboxTasks();
  return (
    <>
      {items.map((task, i) => (
        <InboxRow key={task.id} task={task} index={i} />
      ))}
    </>
  );
}

function InboxCount() {
  useRenderSignal();
  return <>{inboxTasks().length}</>;
}

/**
 * The header toggle and the add form.
 *
 * The form stays hand-built for now: it is the same shape as the four in the
 * quadrants (wireAddForms), and converting one of five would leave two ways of
 * writing the same control. They go together when the matrix does.
 */
export function wireInbox() {
  const input = $<HTMLInputElement>("#inboxInput");

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
      input.value.slice(0, input.selectionStart ?? 0) +
      raw +
      input.value.slice(input.selectionEnd ?? 0);
    addTasks(INBOX, splitBulkText(merged));
    input.value = "";
  });
}

/** Fill the three places index.html left empty. Called once, from init(). */
export function mountInbox() {
  const list = document.getElementById("inboxList");
  if (list) createRoot(list).render(<InboxList />);
  const count = document.getElementById("inboxCount");
  if (count) createRoot(count).render(<InboxCount />);
}
