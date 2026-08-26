/**
 * The due-date popover: the ported `Calendar` (components/ui/calendar.tsx)
 * plus one thing it does not carry -- a way to clear the date. See
 * due-chip.tsx for the trigger that hosts this and why the native
 * `<input type="date">` is gone; see docs/DECISIONS.md, 2026-08-26, for why
 * this pair of packages was chosen, and the same day's follow-up for why the
 * grid itself is now a port of the watermelon registry's calendar rather than
 * a hand-styled `react-day-picker` -- the user asked for both the header
 * (`‹  August 2026  ›`, an arrow at each end) and the clear button that
 * upstream already had, and reusing that build was the point, not
 * reinventing it a second time.
 *
 * This file owns none of the grid's look any more. Its whole job is: pick a
 * locale for the language in effect, pass `mode="single"` through to
 * `Calendar`, and place one `Button` under it that this app needed and
 * upstream's registry does not ship (a plain grid has nothing to clear).
 */

import * as Popover from "@radix-ui/react-popover";
import { enUS, ko } from "date-fns/locale";
import { format, type Locale } from "date-fns";
import { parseDue } from "../../shared/core.js";
import type { Language } from "../../shared/i18n/locales.js";
import { currentLanguage, t } from "../i18n.js";
import { cn } from "../react/cn.js";
import { CloseIcon } from "../react/icons.js";
import { Button } from "./ui/button.js";
import { Calendar } from "./ui/calendar.js";

/**
 * date-fns locales, one per supported language. `SUPPORTED` may grow to
 * three -- see locales.ts -- so this is keyed by `Language` rather than
 * assuming two, and a language added there without an entry here fails to
 * compile instead of falling back silently at runtime.
 */
const DATE_LOCALES: Record<Language, Locale> = { ko, en: enUS };

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
       * whole answer to a 760x520 window: the popover is roughly 210x270,
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
          "z-50 w-fit rounded-md border border-line-strong bg-panel shadow-pop",
          "outline-none",
        )}
        sideOffset={6}
        collisionPadding={8}
        align="start"
      >
        <Calendar
          mode="single"
          autoFocus
          selected={selected}
          defaultMonth={selected ?? new Date()}
          locale={locale}
          showOutsideDays
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
         * Left-aligned and sized to its label -- not stretched across the
         * popover the way a first pass at this control was, which read as a
         * thin hairline bar rather than a button.
         */}
        <div className="flex justify-start px-md pb-md">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "due-calendar-clear",
              "text-muted hover:border-danger hover:bg-danger-soft hover:text-danger",
            )}
            disabled={value == null}
            onClick={() => {
              onChange(null);
              onClose();
            }}
          >
            <CloseIcon />
            {t("common.delete")}
          </Button>
        </div>
      </Popover.Content>
    </Popover.Portal>
  );
}
