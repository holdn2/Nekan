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
        isSelected(task.id) && "selected hover:bg-accent-soft",
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
      {/* The three trailing controls are grouped so flex centres them against
          each other: the marker is an 11px glyph and the other two are 20px
          boxes, and items-center makes that line up without anyone carrying a
          correction value. The row itself stays items-start on purpose -- the
          text wraps, and on a two-line row these belong beside the first line
          rather than floating to the middle of the block. */}
      <div className="flex flex-none items-center gap-md">
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
      </div>
    </li>
  );
}

/**
 * The header's wash and the count's fill, spelled out four times each.
 *
 * Not `bg-q${quad}-soft`: Tailwind reads this file as text, so a name that is
 * assembled at runtime is a rule that never gets generated -- no error, just a
 * header with no colour. Same reason `views/memo.tsx` keeps `QUAD_RULE`.
 */
const QUAD_WASH: Record<Quadrant, string> = {
  q1: "bg-q1-soft",
  q2: "bg-q2-soft",
  q3: "bg-q3-soft",
  q4: "bg-q4-soft",
};

/**
 * The count is the one place a quadrant colour is filled and lettered on, so
 * it takes `*-fill` rather than the dot's colour -- three of the eight are a
 * shade off for the sake of `on-accent`. See `shared/theme.ts`.
 */
const QUAD_COUNT: Record<Quadrant, string> = {
  q1: "bg-q1-fill",
  q2: "bg-q2-fill",
  q3: "bg-q3-fill",
  q4: "bg-q4-fill",
};

function Quad({ quad }: { quad: Quadrant }) {
  useRenderSignal();
  const items = activeOf(quad);
  // A hint, not a limit — see isCrowded. Nothing here stops an add.
  const crowded = isCrowded(quad, items.length);

  return (
    <>
      <header
        className={cn(
          "flex items-center gap-md border-b border-line px-xl py-lg",
          QUAD_WASH[quad],
        )}
      >
        <h2 className="m-[0px] text-md font-semibold">
          {t(`quad.${quad}.title`)}
        </h2>
        <span className="sub text-xs text-muted">
          {t(`quad.${quad}.action`)}
        </span>
        {/* Past the point where the quadrant stops meaning anything -- see
            isCrowded. Still the app noticing rather than the app objecting: it
            is the same chip at the same weight, in a different hue, and the add
            form below still works.

            It used to be a tint (`bg-danger-soft` + `text-danger`), which read
            that way when the header behind it was bare. Now that the header
            carries a wash, a tint on a tint stopped being legible -- measured
            4.53 to 3.46 in dark, under the 4.5 it owes its own lettering. A
            solid fill is both the readable answer (6.73 light / 6.21 dark) and
            the consistent one, since the other three counts are filled too. */}
        <Badge
          className={cn(
            "count ml-auto",
            QUAD_COUNT[quad],
            "text-on-quad",
            // `crowded` stays a class because the test asserts by it. It used
            // to be here for the title bar's chip as well, but nothing has ever
            // put `crowded` on a chip, so that rule was dead and is gone.
            crowded && "crowded cursor-help bg-danger-fill",
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
