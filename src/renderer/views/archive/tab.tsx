/**
 * The body both finished tabs share: a search box, a bulk bar, a page of rows
 * and a button that asks for the next one.
 *
 * Generic over which kind of row it is holding, because history and trash
 * differ only in which timestamp they read and which buttons they offer.
 */

import { useState } from "react";
import { GhostButton } from "../../components/ghost-button.js";
import { cn } from "../../react/cn.js";
import type { Task } from "../../../shared/types.js";
import { t } from "../../i18n.js";
import { useRenderSignal } from "../../react/use-store.js";
import { getTab } from "../../window/chrome.js";
import type { Action, BulkAction } from "./row.js";
import { Row } from "./row.js";
import { PAGE, dayLabel, matches, shown } from "./paging.js";

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
  /**
   * The buttons a row gets. Different on each tab; nothing else is.
   *
   * A function rather than a list, so it runs during *this* component's render
   * and its words cannot be older than the language on screen.
   */
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
        <li
          className="day px-md pt-lg pb-xs text-xs font-semibold tracking-wide text-muted"
          key={`day-${task.id}`}
        >
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
      <div className="history-bar flex gap-md">
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
          <GhostButton
            key={action.labelKey}
            danger={action.danger}
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
            {t(action.labelKey)}
          </GhostButton>
        ))}
      </div>
      {/* Takes what is left of the tab and scrolls inside it, so the bar above
          stays put. */}
      <div className="history-scroll min-h-[0px] flex-auto overflow-y-auto rounded-panel border border-line bg-panel shadow-default">
        <ul className="history-list m-[0px] list-none p-sm">
          {rows}
          {/* The rest are there, they are just not drawn. Saying how many is
              the point: a list that stops without a word is indistinguishable
              from data that is gone, and this list is the one people come to
              when they think something is missing. */}
          {remaining > 0 ? (
            <li className="more flex justify-center pt-lg pb-xs">
              <button
                type="button"
                className={cn(
                  "rounded-pill border border-line bg-panel-2 px-3xl py-sm",
                  "text-sm text-muted",
                  "hover:border-line-strong hover:bg-panel-3 hover:text-text",
                )}
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

export { ArchiveTab };
export type { TabProps };
