/**
 * The 2×2 grid: four quadrants, each a header, a list and a box to add to it.
 *
 * A quadrant is a value of `task.quadrant`, and that is the whole of it -- the
 * rows are the tasks whose quadrant is this one and whose space is the board on
 * screen (store.activeOf). Nothing here decides what a task *is*; it decides
 * where the rows are drawn.
 *
 * React fills each <section>, which stays in index.html because
 * window/dnd.ts binds a drop zone to it and the stylesheet lays the grid out
 * by it.
 */

import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { QUADS, isCrowded } from "../../shared/core.js";
import type { Quadrant, Task } from "../../shared/types.js";
import { t } from "../i18n.js";
import {
  activeOf,
  completeTask,
  deleteTask,
  editTask,
  setDue,
} from "../store.js";
import { notify } from "../render-bus.js";
import { isSelected, wireRowSelection } from "../selection.js";
import { AddForm } from "../components/add-form.js";
import { DueChip } from "../components/due-chip.js";
import { EditableText } from "../components/editable-text.js";
import { MemoMark } from "../components/memo-mark.js";
import { CloseIcon } from "../react/icons.js";
import { useRenderSignal } from "../react/use-store.js";

/** Matches the row's fade-out in styles.css, so the change lands unseen. */
const REMOVE_MS = 160;

/**
 * One quadrant row: complete, text, memo marker, due chip, delete. `index` is
 * only its position in the list on screen — the "1." in front of it.
 */
function Row({ task, index }: { task: Task; index: number }) {
  const li = useRef<HTMLLIElement>(null);
  const [removing, setRemoving] = useState(false);

  /**
   * Click selects, double-click edits -- so a single click waits out the
   * double-click window before it acts. Still bound by hand because the rule
   * involves a timer shared across rows; see selection.ts.
   */
  const wire = (node: HTMLLIElement | null) => {
    li.current = node;
    const text = node?.querySelector<HTMLElement>(".text");
    if (node && text) wireRowSelection(node, text, task);
  };

  /** The row stays on screen for the fade, so the button must not act twice. */
  const leaveAfterFade = (go: () => void) => {
    setRemoving(true);
    setTimeout(go, REMOVE_MS);
  };

  return (
    <li
      ref={wire}
      className={`item${isSelected(task.id) ? " selected" : ""}${removing ? " removing" : ""}`}
      data-id={task.id}
      draggable
    >
      <span className="num">{index + 1}.</span>
      <button
        className="check"
        type="button"
        title={t("item.complete")}
        // Icon-only buttons: without this a screen reader announces "button".
        aria-label={t("item.completeLabel", { text: task.text })}
        disabled={removing}
        onClick={() => leaveAfterFade(() => completeTask(task.id))}
      />
      <EditableText
        value={task.text}
        title={t("item.hint")}
        setDraggable={(on) => {
          if (li.current) li.current.draggable = on;
        }}
        onCommit={(next) => {
          editTask(task.id, next);
          // editTask saves without redrawing, and an emptied row is a deleted
          // one -- the list has to hear about both.
          notify();
        }}
      />
      {task.memo ? <MemoMark memo={task.memo} /> : null}
      <DueChip
        value={task.dueDate}
        onChange={(value) => setDue(task.id, value)}
      />
      <button
        className="del"
        type="button"
        title={t("item.delete")}
        aria-label={t("item.deleteLabel", { text: task.text })}
        disabled={removing}
        onClick={() => leaveAfterFade(() => deleteTask(task.id))}
      >
        <CloseIcon />
      </button>
    </li>
  );
}

function Quad({ quad }: { quad: Quadrant }) {
  useRenderSignal();
  const items = activeOf(quad);
  // A hint, not a limit — see isCrowded. Nothing here stops an add.
  const crowded = isCrowded(quad, items.length);

  return (
    <>
      <header>
        <span className={`dot ${quad}`} />
        <h2>{t(`quad.${quad}.title`)}</h2>
        <span className="sub">{t(`quad.${quad}.action`)}</span>
        <span
          className={`count${crowded ? " crowded" : ""}`}
          data-count={quad}
          title={crowded ? t("matrix.crowded") : undefined}
        >
          {items.length}
        </span>
      </header>
      {/* data-empty is what the stylesheet writes into an empty list; it is an
          attribute rather than a child so :empty still matches. */}
      <ul className="list" data-list={quad} data-empty={t("matrix.empty")}>
        {items.map((task, i) => (
          <Row key={task.id} task={task} index={i} />
        ))}
      </ul>
      <AddForm place={quad} placeholderKey="matrix.addPlaceholder" withDue />
    </>
  );
}

/** Fill the four sections index.html left empty. Called once, from init(). */
export function mountMatrix() {
  for (const quad of QUADS) {
    const host = document.querySelector(`section[data-quad="${quad}"]`);
    if (host) createRoot(host).render(<Quad quad={quad} />);
  }
}
