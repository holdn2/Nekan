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

import { useEffect, useRef, useState } from "react";
import { Dot } from "../components/dot.js";
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
import { Badge } from "../components/badge.js";
import { cn } from "../react/cn.js";
import { CloseIcon } from "../react/icons.js";
import { useRenderSignal } from "../react/use-store.js";

import { DeleteButton, ROW, ROW_TEXT, RowNumber } from "../components/row.js";
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
   *
   * An effect rather than a callback ref. A ref written inline is a new
   * function on every render, so React detaches the old one and attaches the
   * new one -- and with nothing undoing the first, a row that redraws collects
   * another pair of listeners each time. An effect gets to clean up.
   */
  useEffect(() => {
    const node = li.current;
    const text = node?.querySelector<HTMLElement>(".text");
    if (!node || !text) return;
    return wireRowSelection(node, text, task);
  }, [task]);

  /** The row stays on screen for the fade, so the button must not act twice. */
  const leaveAfterFade = (go: () => void) => {
    setRemoving(true);
    setTimeout(go, REMOVE_MS);
  };

  return (
    <li
      ref={li}
      className={cn(
        ROW,
        isSelected(task.id) && "selected",
        removing && "removing",
      )}
      data-id={task.id}
      draggable
    >
      <RowNumber>{index + 1}.</RowNumber>
      <button
        className={cn(
          "check mt-hair h-[16px] w-[16px] flex-none rounded-[50%]",
          "border-[1.6px] border-line-strong bg-transparent p-[0px]",
          "hover:border-accent hover:bg-accent-soft",
        )}
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
        className={ROW_TEXT}
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
      <DeleteButton
        title={t("item.delete")}
        label={t("item.deleteLabel", { text: task.text })}
        disabled={removing}
        onClick={() => leaveAfterFade(() => deleteTask(task.id))}
      >
        <CloseIcon />
      </DeleteButton>
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
      <header className="flex items-center gap-md border-b border-line px-xl py-lg">
        <Dot place={quad} />
        <h2 className="m-[0px] text-md font-semibold">
          {t(`quad.${quad}.title`)}
        </h2>
        <span className="sub text-xs text-muted">
          {t(`quad.${quad}.action`)}
        </span>
        {/* Past the point where the quadrant stops meaning anything -- see
            isCrowded. Deliberately a tint and not a warning: this is the app
            noticing, not the app objecting, and the add form below still works. */}
        <Badge
          className={cn(
            "count ml-auto",
            // `crowded` stays a class: the title bar's chip carries the same
            // state into bar mode and styles it by that name, and it is what
            // this rule is asserted by.
            crowded && "crowded cursor-help bg-danger-soft text-danger",
          )}
          data-count={quad}
          title={crowded ? t("matrix.crowded") : undefined}
        >
          {items.length}
        </Badge>
      </header>
      {/* data-empty is what the stylesheet writes into an empty list; it is an
          attribute rather than a child so :empty still matches. */}
      <ul
        className={cn(
          "list m-[0px] flex min-h-[0px] flex-auto list-none flex-col gap-xs",
          "overflow-y-auto p-sm",
        )}
        data-list={quad}
        data-empty={t("matrix.empty")}
      >
        {items.map((task, i) => (
          <Row key={task.id} task={task} index={i} />
        ))}
      </ul>
      <AddForm place={quad} placeholderKey="matrix.addPlaceholder" withDue />
    </>
  );
}

/**
 * Fill the four sections index.html left empty. Called once, from init().
 *
 * Answers the roots it made, for the same reason mountArchive() does: init()
 * never needs them, and a test that calls this per case would otherwise leave
 * four trees subscribed to the render bus with no way to stop them.
 */
export function mountMatrix() {
  const roots = [];
  for (const quad of QUADS) {
    const host = document.querySelector(`section[data-quad="${quad}"]`);
    if (!host) continue;
    const root = createRoot(host);
    root.render(<Quad quad={quad} />);
    roots.push(root);
  }
  return roots;
}
