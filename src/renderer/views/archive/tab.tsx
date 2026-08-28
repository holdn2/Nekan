/**
 * The body both finished tabs share: a search box, a bulk bar, a page of rows
 * and the control that moves between pages.
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
import { Button } from "../../components/ui/button.js";
import { CloseIcon } from "../../react/icons.js";
import { Input } from "../../components/ui/input.js";
import { PaginationBar } from "../../components/ui/pagination.js";
import { cn } from "../../react/cn.js";
import type { Task } from "../../../shared/types.js";
import { t } from "../../i18n.js";
import { useRenderSignal } from "../../react/use-store.js";
import { getTab } from "../../window/chrome.js";
import type { Action, BulkAction } from "./row.js";
import { Row } from "./row.js";
import { PAGE, dayKey, dayLabel, matches, page, pageCount } from "./paging.js";

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
  // Paging lives outside the component (chrome resets it), so moving between
  // pages has to say that something changed.
  const [, redraw] = useState(0);
  const [pending, setPending] = useState<Pending<T> | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement | null>());
  const scroller = useRef<HTMLDivElement | null>(null);
  const search = useRef<HTMLInputElement | null>(null);
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

  // Only the visible tab draws. Both are mounted, and a page of the other one
  // is a page nobody asked for on every redraw -- which is also why all() is
  // not called at all below unless this tab is the one on screen.
  const visible = getTab() === which;

  // The filter runs over everything and the page is taken out of it, never the
  // other way round. Searching the drawn rows instead would mean a task stops
  // being findable at the moment it falls off the page — which is exactly when
  // someone would go looking for it.
  const items = visible ? all().filter((task) => matches(task, query)) : [];
  const total = pageCount(items.length);
  // Clamped, not reset. Emptying the trash, restoring a row, or a pull landing
  // underneath can all shrink the list out from under whichever page is open;
  // page 7 of a two-page list would otherwise draw nothing, which reads as
  // data that is gone rather than as a page that is. Clamping lands on the
  // last page that does exist -- the rows nearest the ones being looked at --
  // where resetting to 1 would throw away the place after deleting one row.
  const current = visible ? Math.min(page[which], total) : page[which];
  // Written back so the module's answer and the drawn page cannot drift: the
  // next redraw, and any later reset, start from what is actually on screen.
  useEffect(() => {
    if (visible) page[which] = current;
  }, [visible, which, current]);

  // Every hook above this line, so the two tabs keep the same hook order
  // whichever one is on screen.
  if (!visible) return null;

  const go = (next: number) => {
    page[which] = next;
    // A new page starts at its own top. Keeping the old scroll offset lands
    // in the middle of rows nobody chose, under a sticky header for a day
    // that is no longer the first one here.
    scroller.current?.scrollTo({ top: 0 });
    redraw((n) => n + 1);
  };

  // Numbering runs over the whole filtered list rather than over the page, so
  // a row's number is its place in its day. Numbering the page instead would
  // restart at 1 wherever a page boundary fell mid-day, and a day of forty
  // rows would read 1..20 and then 1..20 again.
  const start = (current - 1) * PAGE;
  const numbered: { task: T; key: number; index: number }[] = [];
  let runningKey = 0;
  let withinDay = 0;
  for (const task of items) {
    const key = dayKey(stamp(task));
    if (key !== runningKey) {
      runningKey = key;
      withinDay = 0;
    }
    numbered.push({ task, key, index: withinDay });
    withinDay += 1;
  }
  const drawn = numbered.slice(start, start + PAGE);

  const rows: React.ReactNode[] = [];
  // Starts unset rather than at the previous page's last day, so every page
  // opens with a header saying which day its first row belongs to.
  let lastKey = 0;
  for (const { task, key, index } of drawn) {
    if (key !== lastKey) {
      lastKey = key;
      const day = dayLabel(stamp(task));
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
  }

  return (
    <>
      <div className="flex gap-md">
        {/* The box, and the button that empties it.

            `type="search"` draws its own clear button, and that button is the
            browser's rather than the app's: a blue glyph on a frameless widget
            whose other controls are all drawn. It is turned off and replaced
            here, the same move the native select and the native date input
            got. The type stays -- it is what makes this a searchbox to a
            screen reader, and that is the half worth keeping. */}
        <span
          className={cn(
            "flex h-6xl min-w-[0px] flex-auto items-center gap-2xs",
            "rounded-panel border border-line-strong bg-input-bg pr-2xs",
            "transition-colors focus-within:border-accent focus-within:ring-3",
            "focus-within:ring-accent-soft",
          )}
        >
          <Input
            ref={search}
            type="search"
            id={`${which}Search`}
            value={query}
            // Typing changes which rows these are, so the paging starts over
            // too. Carrying the page across would land a two-character search
            // on page 7 of a two-page result -- a blank list that reads as a
            // bug.
            onChange={(e) => {
              setQuery(e.target.value);
              page[which] = 1;
            }}
            placeholder={t(searchKey)}
            autoComplete="off"
            className={cn(
              "w-auto flex-auto select-text",
              // The wrapper draws the box now; this must not draw a second
              // border, background or focus ring inside it.
              "h-full rounded-[0px] border-0 bg-transparent",
              "focus-visible:border-transparent focus-visible:ring-0",
              // And the browser's own clear button goes. appearance-none is
              // what removes it; `hidden` would not, because the pseudo-element
              // is drawn by the engine rather than laid out as a box.
              "[&::-webkit-search-cancel-button]:appearance-none",
            )}
          />
          {/* Only when there is something to clear. A permanently visible
              button on an empty box is a control that does nothing. */}
          {query ? (
            <Button
              className="text-faint hover:text-text"
              variant="ghost"
              size="icon-xs"
              type="button"
              title={t("common.clear")}
              aria-label={t("common.clear")}
              onClick={() => {
                setQuery("");
                page[which] = 1;
                // This button unmounts the moment the query is empty, which is
                // the moment it is pressed -- so focus has to be handed
                // somewhere or it lands on <body>. The box it just emptied is
                // where typing carries on.
                search.current?.focus();
              }}
            >
              <CloseIcon />
            </Button>
          ) : null}
        </span>
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
      <div
        ref={scroller}
        className="history-scroll min-h-[0px] flex-auto overflow-y-auto rounded-panel border border-line bg-panel shadow-default"
      >
        <ul className="history-list m-[0px] list-none p-sm">{rows}</ul>
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
      {/* Outside the scroller, not inside it: a pager that scrolls away with
          the rows is one you have to reach the bottom of the page to use, and
          reaching the bottom is the moment you want it. Answers nothing at all
          when there is only one page -- see PaginationBar. */}
      <PaginationBar
        className="pt-md"
        page={current}
        pageCount={total}
        onPage={go}
        labels={{
          nav: t("archive.pageNav"),
          first: t("archive.pageFirst"),
          previous: t("archive.pagePrev"),
          next: t("archive.pageNext"),
          last: t("archive.pageLast"),
          // Built here rather than passed as a key, for the reason
          // archive/row.tsx spells out: this component subscribes to the
          // render signal, so its words cannot outlive a language change.
          page: (n) => t("archive.pageNumber", { page: n }),
        }}
      />
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
