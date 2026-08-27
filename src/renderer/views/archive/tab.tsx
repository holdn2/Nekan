/**
 * The body both finished tabs share: a search box, a bulk bar, a page of rows
 * and a button that asks for the next one.
 *
 * Generic over which kind of row it is holding, because history and trash
 * differ only in which timestamp they read and which buttons they offer.
 */

import { useEffect, useRef, useState } from "react";
import { GhostButton } from "../../components/ghost-button.js";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog.js";
import { Input } from "../../components/ui/input.js";
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

/**
 * A bulk action that has been pressed and is waiting on its question.
 *
 * The rows are held here rather than looked up again when the dialog is
 * answered. window.confirm() blocked the thread, so "the list the button saw"
 * and "the list run() is handed" could not differ; a dialog is asynchronous and
 * a pull can land underneath it. Keeping the array means the count in the
 * question and the rows that go are the same rows -- and anything that arrived
 * while the question was on screen, which nobody has been shown a count for,
 * stays.
 */
interface Pending<T extends Task> {
  action: BulkAction<T>;
  items: T[];
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
  const [pending, setPending] = useState<Pending<T> | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement | null>());
  // Focus goes back once the dialog has actually gone, not while it is going.
  // onCloseAutoFocus fires inside Radix's own teardown, and whether the layer
  // blurs afterwards depends on the order the microtasks happen to run in --
  // the same press restored focus or left it on <body> from one run to the
  // next. An effect keyed on `pending` runs after React has committed the
  // unmount, which is the same moment every time.
  useEffect(() => {
    if (pending || !opener.current) return;
    opener.current.focus();
    opener.current = null;
  }, [pending]);
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
        // Pinned to the top of the scroller: two thousand rows is several
        // months, and a date that scrolls away leaves every row below it
        // undated. It costs no height -- it is the same header, parked. The
        // negative margin and the wider padding are the same 8px inset as
        // before, bled out over the list's own 6px so rows cannot show
        // through the gutters beside a pinned header.
        <li
          className="day sticky top-[0px] z-10 -mx-sm bg-panel px-[14px] pt-lg pb-xs text-xs font-semibold tracking-wide text-muted"
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
      <div className="flex gap-md">
        {/* w-auto undoes the primitive's own w-full: in a row beside the bulk
            buttons the box has to grow from its content, not start at the full
            width and squeeze them. text-md and select-text are not taste --
            the body is 13px and sets user-select: none, and the primitive's
            16px would not fit its own 32px box. */}
        <Input
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
          className="w-auto flex-auto select-text"
        />
        {bulk.map((action) => (
          <GhostButton
            key={action.labelKey}
            danger={action.danger}
            // Where focus goes back to after the dialog. Radix returns it to
            // its own Trigger and there is none here -- the dialog is driven
            // by state, so the button stays an ordinary button. Without this,
            // answering with Escape drops focus on <body> and a keyboard
            // loses its place in the tab. Held per action rather than read
            // from document.activeElement at click time, which answers with
            // whatever the last press left behind rather than with this
            // button.
            ref={(node) => {
              buttons.current.set(action.labelKey, node);
            }}
            onClick={() => {
              // The list the tab holds, not a condition to filter by: it is
              // already scoped to the board on screen, and the other board's
              // rows must not go out with it.
              const everything = all();
              if (!everything.length) return;
              if (action.confirm) {
                opener.current = buttons.current.get(action.labelKey) ?? null;
                setPending({ action, items: everything });
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
        {/* Named, because the class it used to carry was its only handle and
            that class was declared over in guide.css. An id is the same handle
            without a sheet on the other end of it. */}
        <p
          id={`${which}Empty`}
          className={cn(
            "m-[0px] px-xl py-5xl text-center text-faint",
            items.length > 0 && "hidden",
          )}
        >
          {query.trim() ? t("archive.noResults") : t(emptyKey)}
        </p>
      </div>
      {/* The question the bulk buttons used to ask through window.confirm().
          That was an OS window opening in front of a frameless widget, and it
          took the words out of the app's own type and palette. Radix keeps the
          parts worth keeping -- the focus trap and Escape -- and unlike a
          Dialog it deliberately ignores a click outside, which is right for a
          question that destroys something. */}
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        {pending ? (
          <AlertDialogContent
            // Radix would send focus to its own Trigger, and there is none --
            // this dialog is opened from state so the bulk button stays an
            // ordinary button. Stop it here; the effect above does the rest.
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <AlertDialogHeader className="place-items-start text-left">
              <AlertDialogTitle>{t(pending.action.labelKey)}</AlertDialogTitle>
              <AlertDialogDescription>
                {pending.action.confirm?.(pending.items.length)}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {/* The primitive stacks its footer and only unstacks it at a
                breakpoint, and this app compiles no @media rules at all, so
                the row has to be asked for here. */}
            <AlertDialogFooter className="flex-row justify-end">
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                variant={pending.action.danger ? "destructive" : "default"}
                onClick={() => pending.action.run(pending.items)}
              >
                {t(pending.action.labelKey)}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </>
  );
}

export { ArchiveTab };
export type { TabProps };
