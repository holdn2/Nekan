/**
 * The history and trash tabs. They are the same list rendered twice — same
 * layout, same day grouping, different timestamp and different buttons — so
 * one component takes both and only the differences are passed in.
 *
 * Neither tab can edit anything. A row here is a record: it can be moved back
 * into play (되돌리기 / 복원) or thrown further away, and that is all.
 *
 * Each <section> stays in index.html and React fills it, because window/chrome
 * shows and hides those sections by class when the tab changes.
 */

import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { Task } from "../../shared/types.js";
import { currentLanguage, t } from "../i18n.js";
import { DueBadge } from "../components/due-badge.js";
import { MemoLine } from "../components/memo-line.js";
import { useRenderSignal } from "../react/use-store.js";
import { getTab } from "../window/chrome.js";
import {
  deleteTask,
  doneTasks,
  purgeAll,
  purgeTask,
  restoreTask,
  trashAll,
  trashedTasks,
  untrashAll,
  untrashTask,
} from "../store.js";

/**
 * How many rows either tab draws before it stops and offers a button.
 *
 * A row costs about 180µs to build and lay out, measured at 2,084 of them
 * (322/355/374/431/451ms across five runs). The search box re-renders on every
 * keystroke, so the budget is one keystroke inside 100ms: 100 rows is 18ms, 200
 * is 36ms, 500 is 90ms and already at the edge.
 *
 * 100 rather than the 200 this started at. Both are comfortably inside the
 * budget, so the number is not really about speed any more -- it is about how
 * much a list is allowed to weigh before it says so. At fifteen visible rows in
 * a default window this is still seven screens of scrolling.
 *
 * The data is never cut -- only what gets built. Search still looks at all of
 * it; see the filter below.
 */
const PAGE = 100;

/**
 * How many rows each tab is currently drawing.
 *
 * Module state rather than component state because window/chrome resets it
 * when the tab changes, and that call cannot reach inside a component. See
 * resetArchivePaging.
 */
const shown = { history: PAGE, trash: PAGE };

/**
 * Back to one page on both tabs.
 *
 * Called when the tab changes, because an expanded list that stays expanded is
 * a slow list forever: someone who once pressed 더 보기 into the thousands
 * would pay for it on every keystroke and every redraw from then on, with
 * nothing on screen explaining why.
 */
export function resetArchivePaging() {
  shown.history = PAGE;
  shown.trash = PAGE;
}

/** What the coloured dot on a row means. */
const QUAD_LABEL: Record<string, () => string> = {
  q1: () => t("archive.quadQ1"),
  q2: () => t("archive.quadQ2"),
  q3: () => t("archive.quadQ3"),
  q4: () => t("archive.quadOther"),
};

/** Day header, in whatever the interface language says it looks like. */
const dayLabel = (ts: number) =>
  new Date(ts).toLocaleDateString(currentLanguage(), {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

/** Time column on a row, to the minute. */
const timeLabel = (ts: number) =>
  new Date(ts).toLocaleTimeString(currentLanguage(), {
    hour: "2-digit",
    minute: "2-digit",
  });

/** Case-insensitive substring match; an empty query matches everything. */
const matches = (task: Task, query: string) => {
  const q = query.trim().toLowerCase();
  return !q || task.text.toLowerCase().includes(q);
};

interface BulkAction<T extends Task> {
  label: string;
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
      <span
        className={`dot ${task.quadrant}`}
        title={QUAD_LABEL[task.quadrant]?.() || ""}
      />
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

interface TabProps<T extends Task> {
  which: "history" | "trash";
  /** Everything the tab could show, before the search and the page limit. */
  all: () => T[];
  /**
   * Which timestamp the day grouping and the time column read.
   *
   * Answers a number, not a nullable one: each tab is handed a list the store
   * has already narrowed -- doneTasks() only contains rows with a completedAt
   * -- and the generic carries that through instead of asking again here.
   */
  stamp: (task: T) => number;
  emptyKey: string;
  searchKey: string;
  /** The buttons a row gets. Different on each tab; nothing else is. */
  actions: (task: T) => Action[];
  /**
   * The buttons that act on the whole tab. Trash has two -- restoring
   * everything asks nothing, emptying it asks first.
   */
  bulk: BulkAction<T>[];
}

function ArchiveTab<T extends Task>({
  which,
  all,
  stamp,
  emptyKey,
  searchKey,
  actions,
  bulk,
}: TabProps<T>) {
  useRenderSignal();
  const [query, setQuery] = useState("");
  // Paging lives outside the component (chrome resets it), so a press of
  // 더 보기 has to say that something changed.
  const [, redraw] = useState(0);
  // Only the visible tab draws. Both are mounted, and a hundred rows of the
  // other one is a hundred rows nobody asked for on every redraw.
  if (getTab() !== which) return null;

  // The filter runs over everything and the limit is applied after it, never
  // the other way round. Searching the drawn rows instead would mean a task
  // stops being findable at the moment it scrolls past the limit — which is
  // exactly when someone would go looking for it.
  const items = all().filter((task) => matches(task, query));
  const drawn = items.slice(0, shown[which]);
  const remaining = items.length - drawn.length;

  const rows: React.ReactNode[] = [];
  let lastDay = "";
  let index = 0;
  for (const task of drawn) {
    const day = dayLabel(stamp(task));
    if (day !== lastDay) {
      lastDay = day;
      index = 0;
      rows.push(
        <li className="day" key={`day-${task.id}`}>
          {day}
        </li>,
      );
    }
    rows.push(
      <Row
        key={task.id}
        task={task}
        index={index}
        at={stamp(task)}
        actions={actions(task)}
      />,
    );
    index += 1;
  }

  return (
    <>
      <div className="history-bar">
        <input
          type="search"
          id={`${which}Search`}
          value={query}
          // Typing changes which rows these are, so the count of them starts
          // over too. Carrying it across would leave a two-character search
          // rendering thousands.
          onChange={(e) => {
            setQuery(e.target.value);
            shown[which] = PAGE;
          }}
          placeholder={t(searchKey)}
          autoComplete="off"
        />
        {bulk.map((action) => (
          <button
            key={action.label}
            className={action.danger ? "ghost danger" : "ghost"}
            type="button"
            onClick={() => {
              // The list the tab holds, not a condition to filter by: it is
              // already scoped to the board on screen, and the other board's
              // rows must not go out with it.
              const everything = all();
              if (!everything.length) return;
              if (
                action.confirm &&
                !window.confirm(action.confirm(everything.length))
              ) {
                return;
              }
              action.run(everything);
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
      <div className="history-scroll">
        <ul className="history-list">
          {rows}
          {/* The rest are there, they are just not drawn. Saying how many is
              the point: a list that stops without a word is indistinguishable
              from data that is gone, and this list is the one people come to
              when they think something is missing. */}
          {remaining > 0 ? (
            <li className="more">
              <button
                type="button"
                onClick={() => {
                  shown[which] += PAGE;
                  redraw((n) => n + 1);
                }}
              >
                {t("archive.more", { count: remaining })}
              </button>
            </li>
          ) : null}
        </ul>
        <p className={`empty${items.length > 0 ? " hidden" : ""}`}>
          {query.trim() ? t("archive.noResults") : t(emptyKey)}
        </p>
      </div>
    </>
  );
}

function History() {
  return (
    <ArchiveTab
      which="history"
      all={doneTasks}
      stamp={(task) => task.completedAt}
      emptyKey="archive.historyEmpty"
      searchKey="history.search"
      actions={(task) => [
        { label: t("archive.restore"), onClick: () => restoreTask(task.id) },
        {
          label: t("archive.delete"),
          onClick: () => deleteTask(task.id),
          danger: true,
        },
      ]}
      bulk={[
        {
          label: t("history.clearAll"),
          danger: true,
          confirm: (count) => t("archive.confirmTrashAll", { count }),
          run: trashAll,
        },
      ]}
    />
  );
}

function Trash() {
  return (
    <ArchiveTab
      which="trash"
      all={trashedTasks}
      stamp={(task) => task.deletedAt}
      emptyKey="archive.trashEmpty"
      searchKey="trash.search"
      actions={(task) => [
        { label: t("archive.untrash"), onClick: () => untrashTask(task.id) },
        {
          label: t("archive.purge"),
          onClick: () => purgeTask(task.id),
          danger: true,
        },
      ]}
      bulk={[
        // No question: restoring puts things back, which is the undo for the
        // one below rather than something to be careful about.
        { label: t("trash.restoreAll"), run: untrashAll },
        {
          label: t("trash.empty"),
          danger: true,
          confirm: (count) => t("archive.confirmPurgeAll", { count }),
          run: purgeAll,
        },
      ]}
    />
  );
}

/** Fill the two sections index.html left empty. Called once, from init(). */
export function mountArchive() {
  const history = document.getElementById("historyView");
  if (history) createRoot(history).render(<History />);
  const trash = document.getElementById("trashView");
  if (trash) createRoot(trash).render(<Trash />);
}
