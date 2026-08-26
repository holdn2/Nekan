/**
 * Ported from the watermelon component registry
 * (scratchpad/watermelon/calendar.tsx), MIT licensed --
 * Copyright (c) 2026 Watermelon Platform Contributors.
 *
 * Kept verbatim: the whole `classNames` shape, and inside it -- unchanged --
 * the two rules the header depends on: `nav` is
 * `absolute top-0 inset-x-0 justify-between` (both arrows pinned to the two
 * ends) and `month_caption` is `flex items-center justify-center ...
 * px-(--cell-size)` (the label centred between them, padded by exactly one
 * cell so it never sits under an arrow). That pair is `‹  August 2026  ›`;
 * changing either one un-does it.
 *
 * DEVIATIONS FROM UPSTREAM, AND WHY:
 *
 * 1. ICONS ARE LUCIDE, NOT HUGEICONS. `ChevronLeft` / `ChevronRight` /
 *    `ChevronDown` stand in for `ArrowLeftIcon` / `ArrowRightIcon` /
 *    `ArrowDownIcon` from `@hugeicons/react`, which is not a dependency here.
 *    Same size (`size-4`, i.e. this app's `size-3xl`) and stroke width.
 *
 * 2. TOKENS. `bg-background` / `bg-popover` -> `bg-panel`; `bg-muted` ->
 *    `bg-panel-2`; `text-muted-foreground` -> `text-muted-foreground` does
 *    not exist here and becomes `text-muted`; `bg-primary` /
 *    `text-primary-foreground` -> `bg-accent` / `text-on-accent`;
 *    `border-ring` / `ring-ring/50` -> `border-line-strong` / `ring-ring`
 *    (this palette's `--ring` is already a translucent colour -- see
 *    ui/button.tsx's file comment for why the `/50` is not stacked on top of
 *    it). `dark:hover:text-foreground` is dropped outright: every token above
 *    is a CSS custom property that already answers `[data-theme="dark"]` on
 *    its own (`styles/palette.css`), so there is no second, class-scoped dark
 *    rule to write.
 *
 * 3. SPACING. No numeric `--spacing` scale exists in this app (see
 *    `styles/index.css`), only named steps, and Tailwind's zero-value
 *    utilities (`p-0`, `inset-0`, ...) do not compile without one -- called
 *    out explicitly in this repo's own notes. `p-2` -> `p-md`, `gap-4` ->
 *    `gap-3xl`, `gap-1` -> `gap-xs`, `gap-1.5` -> `gap-sm`, `mt-2` -> `mt-md`,
 *    `size-3.5` -> `size-2xl`, `after:w-4` -> `after:w-3xl` (all exact
 *    pixel matches at Tailwind's default 4px unit); the handful of zero
 *    utilities (`p-0`, `after:inset-y-0`, `after:right-0`, `after:left-0`)
 *    became `[0px]` arbitrary values instead. `--cell-size` was
 *    `--spacing(7)` (28px at the default unit) and is now the literal
 *    `28px` this app has no scale to derive it from; every other reference
 *    to it still reads `var(--cell-size)`, unchanged.
 *
 * 4. `table` -> `month_grid`. Upstream's `classNames` sets a `table` key,
 *    which is not a member of `ClassNames` in the react-day-picker version
 *    installed here (10.0.1) -- that UI element is named `month_grid` in this
 *    major, and TypeScript rejects an unknown key on a mapped object type.
 *    Same rule, ported name.
 *
 * 5. `DayButtonProps` in place of `typeof DayButton`. Upstream types
 *    `CalendarDayButton`'s props off `React.ComponentProps<typeof DayButton>`
 *    after importing `DayButton` as a type-only binding. react-day-picker
 *    10.0.1 exports the same shape directly as `DayButtonProps`, which reads
 *    the same and needs no `typeof` on a type-only import.
 *
 * 6. `today` IS A RING, NOT A FILL. Upstream paints today's cell with
 *    `bg-muted` (here, `bg-panel-2`), a flat grey box. Ported that way once
 *    and it read wrong twice over: as an unwanted grey square on today
 *    specifically, and -- because this app has no `preflight.css` and every
 *    day is a `<button>` -- as a grey square on every OTHER day too, from
 *    the browser's own default button background showing through a `ghost`
 *    button with no resting fill of its own (fixed at the source in
 *    ui/button.tsx, point 7 there). Today now gets `ring-1 ring-inset
 *    ring-accent` instead: still its own colour, but a line around the cell
 *    rather than a block filling it, and dropped the moment the day is also
 *    selected (`data-[selected=true]:ring-0`) since the accent fill from
 *    `data-selected-single` already reads as "today" once it is the fill.
 *
 * NO DEFAULT STYLESHEET, same as due-calendar.tsx before this port:
 * `react-day-picker/style.css` is never imported, so every colour comes
 * through `classNames` and this app's own tokens rather than the library's
 * hard-coded ones -- `tools/check-colors.js` would have nothing to say about
 * a hex value sitting in node_modules.
 */

import * as React from "react";
import {
  DayPicker,
  getDefaultClassNames,
  type ClassNames,
  type DayButtonProps,
  type Locale,
} from "react-day-picker";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "../../react/cn.js";
import { Button, buttonVariants } from "./button.js";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  locale,
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "p-md [--cell-radius:var(--radius-md)] [--cell-size:28px] bg-panel group/calendar in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className,
      )}
      captionLayout={captionLayout}
      locale={locale}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString(locale?.code, { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn("flex gap-3xl flex-col relative", defaultClassNames.months),
        month: cn("flex flex-col w-full gap-3xl", defaultClassNames.month),
        nav: cn(
          "flex items-center gap-xs w-full absolute top-0 inset-x-0 justify-between",
          defaultClassNames.nav,
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) aria-disabled:opacity-50 p-[0px] select-none",
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) aria-disabled:opacity-50 p-[0px] select-none",
          defaultClassNames.button_next,
        ),
        month_caption: cn(
          "flex items-center justify-center h-(--cell-size) w-full px-(--cell-size)",
          defaultClassNames.month_caption,
        ),
        dropdowns: cn(
          "w-full flex items-center text-sm font-medium justify-center h-(--cell-size) gap-sm",
          defaultClassNames.dropdowns,
        ),
        dropdown_root: cn(
          "relative rounded-(--cell-radius)",
          defaultClassNames.dropdown_root,
        ),
        dropdown: cn(
          "absolute bg-panel inset-[0px] opacity-0",
          defaultClassNames.dropdown,
        ),
        caption_label: cn(
          "select-none font-medium",
          captionLayout === "label"
            ? "text-sm"
            : "rounded-(--cell-radius) flex items-center gap-xs text-sm [&>svg]:text-muted [&>svg]:size-2xl",
          defaultClassNames.caption_label,
        ),
        month_grid: "w-full border-collapse",
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "text-muted rounded-(--cell-radius) flex-1 font-normal text-[0.8rem] select-none",
          defaultClassNames.weekday,
        ),
        week: cn("flex w-full mt-md", defaultClassNames.week),
        week_number_header: cn(
          "select-none w-(--cell-size)",
          defaultClassNames.week_number_header,
        ),
        week_number: cn(
          "text-[0.8rem] select-none text-muted",
          defaultClassNames.week_number,
        ),
        day: cn(
          "relative w-full rounded-(--cell-radius) h-full p-[0px] text-center [&:last-child[data-selected=true]_button]:rounded-r-(--cell-radius) group/day aspect-square select-none",
          props.showWeekNumber
            ? "[&:nth-child(2)[data-selected=true]_button]:rounded-l-(--cell-radius)"
            : "[&:first-child[data-selected=true]_button]:rounded-l-(--cell-radius)",
          defaultClassNames.day,
        ),
        range_start: cn(
          "rounded-l-(--cell-radius) bg-panel-2 relative after:bg-panel-2 after:absolute after:inset-y-[0px] after:w-3xl after:right-[0px] z-0 isolate",
          defaultClassNames.range_start,
        ),
        range_middle: cn("rounded-none", defaultClassNames.range_middle),
        range_end: cn(
          "rounded-r-(--cell-radius) bg-panel-2 relative after:bg-panel-2 after:absolute after:inset-y-[0px] after:w-3xl after:left-[0px] z-0 isolate",
          defaultClassNames.range_end,
        ),
        // A ring, not a fill: a filled `bg-panel-2` here read as an unwanted
        // grey box on today's cell, and worse, the resting background every
        // OTHER day showed too (see ui/button.tsx's file comment, point 7) --
        // this app never imports Tailwind's preflight, so a `<button>`'s
        // native chrome has to be erased explicitly rather than assumed
        // gone. Today keeps its own signal once that fill is gone: a ring in
        // the accent, dropped only once the day is actually selected, at
        // which point the accent fill from `data-selected-single` already
        // says "today" and "selected" both.
        today: cn(
          "rounded-(--cell-radius) ring-1 ring-inset ring-accent data-[selected=true]:ring-0",
          defaultClassNames.today,
        ),
        outside: cn(
          "text-muted aria-selected:text-muted",
          defaultClassNames.outside,
        ),
        disabled: cn("text-muted opacity-50", defaultClassNames.disabled),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          );
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeft
                strokeWidth={2}
                className={cn("size-3xl", className)}
                {...props}
              />
            );
          }

          if (orientation === "right") {
            return (
              <ChevronRight
                strokeWidth={2}
                className={cn("size-3xl", className)}
                {...props}
              />
            );
          }

          return (
            <ChevronDown
              strokeWidth={2}
              className={cn("size-3xl", className)}
              {...props}
            />
          );
        },
        DayButton: ({ ...props }) => (
          <CalendarDayButton locale={locale} {...props} />
        ),
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-(--cell-size) items-center justify-center text-center">
                {children}
              </div>
            </td>
          );
        },
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  locale,
  ...props
}: DayButtonProps & { locale?: Partial<Locale> }) {
  const defaultClassNames = getDefaultClassNames();

  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString(locale?.code)}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "data-[selected-single=true]:bg-accent data-[selected-single=true]:text-on-accent data-[range-middle=true]:bg-panel-2 data-[range-middle=true]:text-text data-[range-start=true]:bg-accent data-[range-start=true]:text-on-accent data-[range-end=true]:bg-accent data-[range-end=true]:text-on-accent group-data-[focused=true]/day:border-line-strong group-data-[focused=true]/day:ring-ring relative isolate z-10 flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-xs border-0 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-[3px] data-[range-end=true]:rounded-(--cell-radius) data-[range-end=true]:rounded-r-(--cell-radius) data-[range-middle=true]:rounded-none data-[range-start=true]:rounded-(--cell-radius) data-[range-start=true]:rounded-l-(--cell-radius) [&>span]:text-xs [&>span]:opacity-70",
        defaultClassNames.day,
        className,
      )}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
