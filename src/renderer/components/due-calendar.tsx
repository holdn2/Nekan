/**
 * The grid inside a due-date popover: react-day-picker, styled with this
 * app's own tokens, plus the one affordance that had to be rebuilt when the
 * native `<input type="date">` went away -- a way to clear the date. See
 * due-chip.tsx for the popover that hosts this and why the native input is
 * gone; see docs/DECISIONS.md, 2026-08-26, for why this pair of packages was
 * chosen over the alternatives.
 *
 * NO DEFAULT STYLESHEET
 *
 * react-day-picker ships `react-day-picker/style.css`, and it is not imported
 * here. That sheet hard-codes its own colours (`--rdp-accent-color: blue`,
 * literal hex elsewhere) and this app's `tools/check-colors.js` would have
 * nothing to say about them -- they live in node_modules, outside the paths
 * it scans -- so the leak would be silent. Every part is named instead
 * through the `classNames` prop and painted with `cn()`, the same palette
 * tokens as the rest of the renderer.
 *
 * WHERE THE DAY STATES LIVE
 *
 * Checked directly in react-day-picker's source (DayPicker.js): the day
 * `<td>` -- not the `<button>` inside it -- is the element that receives
 * `data-selected` / `data-today` / `data-outside` / `data-disabled`. The
 * `<button>` only ever gets the one static class named in
 * `classNames.day_button`. So `DAY_CLASS` below is where all four states are
 * painted, using Tailwind's `data-*` variant on the `<td>` combined with an
 * arbitrary `[&_button]` selector to reach the button a level down -- there
 * is no state-specific `classNames.selected` / `.today` because that data
 * attribute already carries the state, on the one element that has it.
 */

import * as Popover from "@radix-ui/react-popover";
import { DayPicker, type ClassNames } from "react-day-picker";
import { enUS, ko } from "date-fns/locale";
import { format, type Locale } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { parseDue } from "../../shared/core.js";
import type { Language } from "../../shared/i18n/locales.js";
import { currentLanguage, t } from "../i18n.js";
import { cn } from "../react/cn.js";
import { CloseIcon } from "../react/icons.js";

/**
 * date-fns locales, one per supported language. `SUPPORTED` may grow to
 * three -- see locales.ts -- so this is keyed by `Language` rather than
 * assuming two, and a language added there without an entry here fails to
 * compile instead of falling back silently at runtime.
 */
const DATE_LOCALES: Record<Language, Locale> = { ko, en: enUS };

/** Reset the two interactive elements down to something this app can paint. */
const NAV_BUTTON = cn(
  "flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-sm",
  "border-0 bg-transparent p-[0px] text-muted",
  "hover:bg-panel-3 hover:text-text",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
  "disabled:pointer-events-none disabled:opacity-40",
);

const DAY_BUTTON = cn(
  "flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-sm",
  "border-0 bg-transparent p-[0px] font-[inherit] text-text",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
);

/**
 * The day cell. Every state below is a `data-*` variant, because that is
 * where react-day-picker puts the state -- see the file comment. `far`'s
 * "today" ring reuses `border-accent` rather than a new token: the accent is
 * already what `today` means on the chip itself (due-chip.tsx's DUE_TINT).
 */
const DAY_CLASS = cn(
  "p-hair text-center align-middle",
  "data-outside:opacity-50",
  "[&_button]:mx-auto",
  "hover:[&_button]:bg-panel-3",
  "data-today:[&_button]:border data-today:[&_button]:border-accent",
  "data-selected:[&_button]:bg-accent data-selected:[&_button]:text-on-accent",
  "data-selected:[&_button]:font-semibold",
  "data-disabled:[&_button]:pointer-events-none data-disabled:[&_button]:opacity-30",
);

const CLASS_NAMES: Partial<ClassNames> = {
  root: "text-text",
  months: "flex flex-col",
  month: "flex flex-col gap-xs",
  month_caption: "flex items-center justify-between px-2xs",
  caption_label: "text-sm font-medium",
  nav: "flex items-center gap-2xs",
  button_previous: NAV_BUTTON,
  button_next: NAV_BUTTON,
  month_grid: "border-collapse",
  weekday: "w-[30px] pb-2xs text-center text-xs font-normal text-faint",
  day: DAY_CLASS,
  day_button: DAY_BUTTON,
};

/** `<button>` inside `Chevron`'s single slot points either way; render ours. */
function Chevron({
  orientation,
}: {
  orientation?: "left" | "right" | "up" | "down";
}) {
  return orientation === "right" ? (
    <ChevronRight size={14} aria-hidden="true" />
  ) : (
    <ChevronLeft size={14} aria-hidden="true" />
  );
}

interface Props {
  /** 'YYYY-MM-DD', or null for a chip with no date on it yet. */
  value: string | null;
  /** The new date, or null when it was cleared. */
  onChange: (next: string | null) => void;
  /** Closes the popover -- picking a day or clearing the date both do. */
  onClose: () => void;
}

export function DueCalendar({ value, onChange, onClose }: Props) {
  const selected = parseDue(value) ?? undefined;
  const language = currentLanguage() as Language;
  const locale = DATE_LOCALES[language] ?? enUS;

  return (
    <Popover.Portal>
      {/*
       * `collisionPadding` plus Radix's default `avoidCollisions` is the
       * whole answer to a 760x520 window: the popover is roughly 230x300,
       * and a row near the bottom-right quadrant has nowhere near that much
       * room below or to the right of it. Radix flips to whichever side of
       * the trigger still fits and then shifts along that axis, checked at
       * that window size rather than assumed -- see the verification notes
       * this branch shipped with.
       */}
      <Popover.Content
        // "due-calendar" carries no styling of its own -- it is a hook, the
        // way ".due" and ".face" stay classes elsewhere in this pair of
        // components even after their look moved to utilities.
        className={cn(
          "due-calendar",
          "z-50 w-[230px] rounded-md border border-line-strong bg-panel p-sm shadow-pop",
          "outline-none",
        )}
        sideOffset={6}
        collisionPadding={8}
        align="start"
      >
        <DayPicker
          mode="single"
          autoFocus
          selected={selected}
          defaultMonth={selected ?? new Date()}
          locale={locale}
          showOutsideDays
          classNames={CLASS_NAMES}
          components={{ Chevron }}
          onSelect={(date) => {
            onChange(date ? format(date, "yyyy-MM-dd") : null);
            onClose();
          }}
        />
        {/*
         * MUST REPLACE, not may: due-chip.tsx used to lean on the native
         * picker's own clear affordance, and that picker is gone. Disabled
         * rather than hidden when there is nothing to clear, so the row of
         * controls does not jump as a date is picked and then cleared again.
         */}
        <button
          type="button"
          className={cn(
            "due-calendar-clear",
            "mt-xs flex w-full items-center justify-center gap-2xs rounded-sm",
            "border border-line-strong bg-transparent px-md py-2xs text-xs text-muted",
            "hover:border-danger hover:bg-danger-soft hover:text-danger",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
            "disabled:pointer-events-none disabled:opacity-40",
          )}
          disabled={value == null}
          onClick={() => {
            onChange(null);
            onClose();
          }}
        >
          <CloseIcon />
          {t("common.delete")}
        </button>
      </Popover.Content>
    </Popover.Portal>
  );
}
