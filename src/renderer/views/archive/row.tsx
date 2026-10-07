/**
 * One finished row, and the shapes the tab hands it.
 *
 * A bulk action carries a key rather than the words. These are built by a
 * parent that does not subscribe to the render signal, so a string made up
 * there never changes again -- which is how three Korean buttons ended up in
 * an English window. Translating where they are drawn makes that impossible
 * rather than remembered.
 */

import type { Task } from "../../../shared/types.js";
import { INBOX } from "../../../shared/core.js";
import { Dot } from "../../components/dot.js";
import { DueBadge } from "../../components/due-badge.js";
import { cn } from "../../react/cn.js";
import { MemoLine } from "../../components/memo-line.js";
import { QUAD_LABEL, timeLabel } from "./paging.js";

/** The names the label column is sized to fit. */
const PLACES_IN_ORDER = Object.keys(QUAD_LABEL);

import { RowNumber } from "../../components/row.js";
interface BulkAction<T extends Task> {
  /**
   * The key, not the words.
   *
   * These are handed down as props, and a parent that does not subscribe to
   * the render signal never rebuilds them -- which left three buttons in
   * Korean inside an English window. Translating where they are drawn is what
   * makes that impossible rather than remembered.
   */
  labelKey: string;
  danger?: boolean;
  /** The question, when there is one. No confirm means it just runs. */
  confirm?: (count: number) => string;
  run: (items: T[]) => void;
}

interface Action {
  label: string;
  onClick: () => void;
  /** 삭제 / 영구 삭제 -- the stylesheet tints these red. */
  danger?: boolean;
}

function Row({
  task,
  index,
  at,
  actions,
}: {
  task: Task;
  index: number;
  at: number;
  actions: Action[];
}) {
  return (
    // `group` is what makes the row's buttons appear on hover without a
    // descendant rule. With a memo the row is several lines tall, so everything
    // beside the title lines up with it rather than floating to the middle --
    // which is the `mt-*` on the four things that follow.
    <li
      className={cn(
        "hitem group flex gap-lg rounded-md p-md hover:bg-panel-2",
        task.memo ? "items-start" : "items-center",
      )}
    >
      <RowNumber className={cn("-mr-xs leading-none", task.memo && "mt-xs")}>
        {index + 1}.
      </RowNumber>
      {/* Where it was, said in words beside the colour, as the phone's
          history says it (issue 148). It used to be the dot alone with the
          name in a hover tooltip, which nobody finds without looking for it.
          The dump is not one of the four, so it has no dot -- as on the
          phone. */}
      <span
        className={cn(
          "where flex flex-none items-center gap-xs text-xs whitespace-nowrap text-faint",
          task.memo && "mt-hair",
        )}
      >
        {/* The dump keeps the dot's slot empty, so its name starts where
            the others' do. */}
        {task.quadrant === INBOX ? (
          <span className="w-md shrink-0" />
        ) : (
          <Dot place={task.quadrant} />
        )}
        {/* Every place's name stacked in one cell, only this row's visible:
            the column is as wide as the longest name in the current language
            on every row, so the titles start in one line (issue 148). A fixed
            width would be right for one language and wrong for the other. */}
        <span className="grid">
          {PLACES_IN_ORDER.map((place) => (
            <span
              key={place}
              aria-hidden={place === task.quadrant ? undefined : true}
              className={cn(
                "[grid-area:1/1]",
                place !== task.quadrant && "invisible",
              )}
            >
              {QUAD_LABEL[place]?.() || ""}
            </span>
          ))}
        </span>
      </span>
      {/* Title and memo share one column, so the memo lines up under the title
          and stops where the date column starts instead of running alongside
          it. */}
      <div className="hmain flex min-w-[0px] flex-auto flex-col gap-xs">
        <span className="text flex-auto [word-break:break-word] font-light text-muted line-through select-text">
          {task.text}
        </span>
        {task.memo ? <MemoLine memo={task.memo} /> : null}
      </div>
      <DueBadge
        value={task.dueDate}
        className={task.memo ? "mt-hair" : undefined}
      />
      {/* The title column is the only thing that may give up width, so the
          timestamp and the buttons keep one line and stay aligned across rows. */}
      <span
        className={cn(
          "time flex-none text-xs whitespace-nowrap text-faint tabular-nums",
          task.memo && "mt-hair",
        )}
      >
        {timeLabel(at)}
      </span>
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          className={cn(
            "act flex-none rounded-sm border bg-transparent",
            "px-md py-2xs text-xs whitespace-nowrap opacity-0",
            "group-hover:opacity-100 focus-visible:opacity-100",
            // A deleting button says so in red as soon as it shows -- it only
            // shows on the row under the pointer, so it is never a column of
            // red down the list (issue 148).
            action.danger
              ? "border-danger text-danger hover:bg-danger-soft"
              : "border-line-strong text-muted hover:border-accent hover:bg-accent-soft hover:text-accent",
          )}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      ))}
    </li>
  );
}

export type { Action, BulkAction };
export { Row };
