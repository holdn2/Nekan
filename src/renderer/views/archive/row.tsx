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
import { Dot } from "../../components/dot.js";
import { DueBadge } from "../../components/due-badge.js";
import { MemoLine } from "../../components/memo-line.js";
import { QUAD_LABEL, timeLabel } from "./paging.js";

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
    <li className={`hitem${task.memo ? " has-memo" : ""}`}>
      <span className="num">{index + 1}.</span>
      <Dot place={task.quadrant} title={QUAD_LABEL[task.quadrant]?.() || ""} />
      {/* Title and memo share one column, so the memo lines up under the title
          and stops where the date column starts instead of running alongside
          it. */}
      <div className="hmain">
        <span className="text">{task.text}</span>
        {task.memo ? <MemoLine memo={task.memo} /> : null}
      </div>
      <DueBadge value={task.dueDate} />
      <span className="time">{timeLabel(at)}</span>
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          className={action.danger ? "act danger" : "act"}
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
