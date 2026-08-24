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
 *
 * The <section> itself stays in index.html and React fills it. That is not
 * squeamishness: it is a flex child the layout sizes with --memo-h, and
 * window/layout.js finds it by id to drag its top edge. Wrapping it in a root
 * of our own would put a div between the two and quietly break both.
 */

import { useEffect, useRef, useState } from "react";
import { Dot } from "../components/dot.js";
import { GhostButton } from "../components/ghost-button.js";
import { createRoot } from "react-dom/client";
import { clampMemo } from "../../shared/core.js";
import { t } from "../i18n.js";
import { setMemo } from "../store.js";
import {
  isMemoEditing,
  selectedTask,
  setMemoEditing,
  setSelected,
} from "../selection.js";
import { useRenderSignal } from "../react/use-store.js";
import { CloseIcon } from "../react/icons.js";

export function MemoPanel() {
  useRenderSignal();
  const task = selectedTask();
  const memo = task?.memo ?? "";
  // A task with no note yet opens straight into the editor: there is nothing to
  // read, and asking someone to double-click an empty box to begin is a step
  // that exists only because the state machine has two states.
  const editing = isMemoEditing() || !memo;

  // What the textarea is currently showing, and what it was seeded from. The
  // seed is compared during render rather than watched with an effect: when the
  // panel changes what it is showing the text is replaced, and on every other
  // render it is left strictly alone -- so a sync landing mid-sentence cannot
  // wipe what is being typed.
  const seed = `${task?.id ?? ""}:${editing}`;
  const [seenSeed, setSeenSeed] = useState(seed);
  const [value, setValue] = useState(memo);
  if (seenSeed !== seed) {
    setSeenSeed(seed);
    setValue(memo);
  }

  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!editing) return;
    const el = input.current;
    if (!el) return;
    el.focus();
    // Caret at the end rather than selecting the lot: reopening a note is
    // usually to add to it, and a select-all is one keystroke from losing it.
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing, seed]);

  // The host is a flex child of the layout, so its own class is the only thing
  // about it we touch -- the rest of the section belongs to index.html.
  useEffect(() => {
    document.getElementById("memoPanel")?.classList.toggle("hidden", !task);
  }, [task]);

  if (!task) return null;

  // clampMemo trims the way the save path does, so what the button compares is
  // what would actually be written.
  const trimmed = clampMemo(value);
  const original = task.memo || null;
  const canSave = Boolean(trimmed) && trimmed !== original;

  const save = () => {
    if (!canSave) return;
    setMemoEditing(false);
    setMemo(task.id, trimmed);
  };

  /** Esc / Cancel: back to reading, or close outright if there was nothing yet. */
  const cancel = () => {
    if (!original) {
      setSelected(null);
      return;
    }
    setMemoEditing(false);
  };

  /** Drop the memo but keep the task. Confirmed, because there is no undo. */
  const remove = () => {
    if (!original) return;
    if (!window.confirm(t("memo.confirmDelete"))) return;
    setMemoEditing(false);
    setMemo(task.id, null);
  };

  return (
    <div className="memo-card">
      <header className="memo-head">
        <Dot place={task.quadrant} id="memoDot" />
        <span className="memo-title" id="memoTitle" title={task.text}>
          {task.text}
        </span>
        <button
          className="memo-x"
          id="memoClose"
          type="button"
          title={t("memo.close")}
          aria-label={t("memo.close")}
          onClick={() => setSelected(null)}
        >
          <CloseIcon />
        </button>
      </header>

      <div className="memo-body">
        <p
          className={`memo-text${editing ? " hidden" : ""}`}
          id="memoText"
          title={t("memo.edit")}
          onDoubleClick={() => setMemoEditing(true)}
        >
          {memo}
        </p>
        <textarea
          ref={input}
          id="memoInput"
          className={editing ? "" : "hidden"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("memo.placeholder")}
          aria-label={t("memo.field")}
          maxLength={2000}
          spellCheck={false}
          onKeyDown={(e) => {
            // An IME is mid-word: the Escape that abandons a Korean syllable
            // must not also close the note. Ctrl+Enter is safe either way, but
            // the guard belongs to the handler rather than to one branch.
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            } else if (e.key === "Enter" && e.ctrlKey) {
              e.preventDefault();
              save();
            }
          }}
        />
      </div>

      <footer className="memo-foot">
        <span className="memo-hint" id="memoHint">
          {t(editing ? "memo.editing" : "memo.edit")}
        </span>
        <GhostButton
          danger
          className={editing || !original ? "hidden" : undefined}
          id="memoDelete"
          onClick={remove}
        >
          {t("common.delete")}
        </GhostButton>
        <GhostButton
          className={!editing || !original ? "hidden" : undefined}
          id="memoCancel"
          onClick={cancel}
        >
          {t("common.cancel")}
        </GhostButton>
        <button
          className={`primary${editing ? "" : " hidden"}`}
          id="memoSave"
          type="button"
          disabled={!canSave}
          onClick={save}
        >
          {t("common.save")}
        </button>
      </footer>
    </div>
  );
}

/** Fill the panel that index.html left empty. Called once, from init(). */
export function mountMemo() {
  const host = document.getElementById("memoPanel");
  if (host) createRoot(host).render(<MemoPanel />);
}
