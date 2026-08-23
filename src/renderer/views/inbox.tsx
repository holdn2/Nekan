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

import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { INBOX, splitBulkText } from "../../shared/core.js";
import type { Task } from "../../shared/types.js";
import { $ } from "../dom.js";
import { t } from "../i18n.js";
import { addTasks, deleteTask, editTask, inboxTasks } from "../store.js";
import { notify } from "../render-bus.js";
import { EditableText } from "../components/editable-text.js";
import { AddForm } from "../components/add-form.js";
import { ChevronIcon, CloseIcon } from "../react/icons.js";
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
  // The panel is index.html's, so its class is set here. The button inside it
  // is not: it renders its own aria-expanded, and reaching for it from init --
  // before React has drawn it -- is how this stopped at <body class="booting">
  // once already.
  $("#inboxPanel").classList.toggle("open", inboxOpen);
  notify();
  if (persist) window.api.setInboxOpen(inboxOpen);
}

/** Unfold and put the caret in the box — what Ctrl+0 does. */
export function focusInbox() {
  applyInboxOpen(true);
  document.querySelector<HTMLInputElement>("#inboxInput")?.focus();
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
  // The list element is index.html's, so its empty-state attribute is set from
  // here rather than rendered -- :empty has to keep matching.
  useEffect(() => {
    document
      .getElementById("inboxList")
      ?.setAttribute("data-empty", t("inbox.empty"));
  });
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
 * The header: a chevron, what the panel is, and how many are waiting.
 *
 * It says "Shared by Work and Life" because it is the one list the board
 * switch does not scope -- everything else in the window follows that switch,
 * and a staging list that did would hide half of what you wrote down.
 */
function InboxHead() {
  useRenderSignal();
  return (
    <button
      className="inbox-toggle"
      id="inboxToggle"
      type="button"
      aria-expanded={inboxOpen}
      aria-controls="inboxBody"
      onClick={() => {
        applyInboxOpen(!inboxOpen);
        if (inboxOpen)
          document.querySelector<HTMLInputElement>("#inboxInput")?.focus();
      }}
    >
      <ChevronIcon />
      <span className="inbox-label">{t("inbox.title")}</span>
      {/* Says what the panel is, the way each quadrant's .sub does. It used to
          be a bordered pill reading just "Shared", which named a property
          without saying whose. */}
      <span className="inbox-sub">{t("inbox.shared")}</span>
      <span className="badge" id="inboxCount">
        <InboxCount />
      </span>
    </button>
  );
}

/**
 * The brain dump's add box.
 *
 * The same component as a quadrant's, minus the date -- when something goes
 * here it is because nothing about it has been decided yet, and that includes
 * when it is due.
 */
function InboxAdd() {
  useRenderSignal();
  return (
    <AddForm
      place={INBOX}
      placeholderKey="inbox.placeholder"
      onPaste={(e, text) => {
        // Most brain dumps are already written down somewhere else. Pasting a
        // block of lines should give one item per line, not a single item with
        // the newlines flattened out of it.
        const raw = e.clipboardData?.getData("text") ?? "";
        if (!raw.includes(String.fromCharCode(10))) return false;
        e.preventDefault();
        // Splice the paste into whatever is already typed before cutting on
        // newlines, so a half-finished line in the box becomes the first item
        // instead of being silently dropped.
        const el = e.currentTarget;
        const merged =
          text.slice(0, el.selectionStart ?? 0) +
          raw +
          text.slice(el.selectionEnd ?? 0);
        addTasks(INBOX, splitBulkText(merged));
        return true;
      }}
    />
  );
}

/** Fill the three places index.html left empty. Called once, from init(). */
export function mountInbox() {
  const head = document.querySelector(".inbox-head");
  if (head) createRoot(head).render(<InboxHead />);
  const list = document.getElementById("inboxList");
  if (list) createRoot(list).render(<InboxList />);
  const add = document.getElementById("inboxAddHost");
  if (add) createRoot(add).render(<InboxAdd />);
}
