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
import { addTasks, deleteTask, editTask, inboxTasks } from "../store.js";
import { notify } from "../render-bus.js";
import { Badge } from "../components/badge.js";
import { EditableText } from "../components/editable-text.js";
import { AddForm } from "../components/add-form.js";
import { ChevronIcon, CloseIcon } from "../react/icons.js";
import { useRenderSignal } from "../react/use-store.js";

import { DeleteButton, ROW, ROW_TEXT, RowNumber } from "../components/row.js";
import { cn } from "../react/cn.js";
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
      className={cn(ROW, "inbox-item", removing && "removing")}
      data-id={task.id}
      draggable
    >
      <RowNumber>{index + 1}.</RowNumber>
      <EditableText
        value={task.text}
        title={t("item.hintInbox")}
        className={ROW_TEXT}
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
      <DeleteButton
        title={t("item.delete")}
        label={t("item.deleteLabel", { text: task.text })}
        disabled={removing}
        onClick={() => {
          // The row fades before it goes; the store hears about it when the
          // animation is over.
          setRemoving(true);
          setTimeout(() => deleteTask(task.id), REMOVE_MS);
        }}
      >
        <CloseIcon />
      </DeleteButton>
    </li>
  );
}

function InboxList() {
  useRenderSignal();
  const items = inboxTasks();
  return (
    // data-empty is what the stylesheet writes into an empty list, exactly as
    // a quadrant does it. An attribute rather than an element, because the
    // rule is `:empty::after` -- an element saying "nothing here" would be a
    // child, and then the list is not empty any more.
    <ul
      className="inbox-list m-[0px] min-h-[0px] shrink list-none overflow-y-auto p-sm"
      id="inboxList"
      data-empty={t("inbox.empty")}
    >
      {items.map((task, i) => (
        <InboxRow key={task.id} task={task} index={i} />
      ))}
    </ul>
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
      className={cn(
        // Spans the row so the count can sit at the far right, the way the
        // quadrant headers and the tab badges do. A header that stopped
        // halfway also looked clickable only halfway.
        "inbox-toggle group flex min-w-[0px] flex-auto items-center gap-md",
        "border-0",
        "bg-transparent px-xl py-md font-medium hover:text-accent",
      )}
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
      <ChevronIcon open={inboxOpen} />
      <span className="inbox-label">{t("inbox.title")}</span>
      {/* Says what the panel is, the way each quadrant's .sub does. It used to
          be a bordered pill reading just "Shared", which named a property
          without saying whose. */}
      <span
        className={cn(
          "inbox-sub min-w-[0px] shrink basis-auto overflow-hidden text-xs",
          "whitespace-nowrap text-ellipsis text-faint",
        )}
      >
        {t("inbox.shared")}
      </span>
      <Badge id="inboxCount">
        <InboxCount />
      </Badge>
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

/**
 * The whole panel, from one root.
 *
 * The <section> stays index.html's -- it is a drop zone, a flex child the
 * layout measures, and the thing whose `open` class decides the panel's
 * height. Everything inside it is drawn here, which is what lets the list
 * carry its own empty-state attribute instead of being reached for by id
 * after every render.
 */
function InboxPanel() {
  // The fold is React's answer, not a stylesheet's. It used to be
  // `section.inbox.open .inbox-body`, which stopped working the moment the body
  // carried `hidden`: that is a utility now, and utilities are a later layer
  // than the hand-written rules, so it won however specific the rule was.
  useRenderSignal();
  return (
    <>
      <header className="inbox-head flex flex-none items-center gap-lg pr-xl">
        <InboxHead />
      </header>
      {/* A column so the shrink lands on the list and not on the add form: the
          input is the whole point of the panel and must not be the part that
          gets squeezed out. Shown only when the panel is open -- the class on
          the section is what says so, and inbox.css still carries that one
          rule because the section is index.html's. */}
      <div
        className={cn(
          "inbox-body min-h-[0px] shrink flex-col border-t border-line",
          inboxOpen ? "flex" : "hidden",
        )}
        id="inboxBody"
      >
        <InboxList />
        <InboxAdd />
      </div>
    </>
  );
}

/** Fill the section index.html left empty. Called once, from init(). */
export function mountInbox() {
  const panel = document.getElementById("inboxPanel");
  if (panel) createRoot(panel).render(<InboxPanel />);
}
