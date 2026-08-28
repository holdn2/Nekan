/**
 * A due date you can change: a chip that opens a calendar popover, so a click
 * anywhere on it lets you pick a date instead of typing one.
 *
 * Used to be a native `<input type="date">` stretched invisibly over this
 * same face -- see docs/DECISIONS.md, 2026-08-26, for why that had to go (the
 * OS drew it, and this app no longer lets the OS draw anything but two
 * things, of which this was one). The calendar itself is
 * components/due-calendar.tsx; this file keeps the trigger, the face, and the
 * tints, none of which changed shape.
 *
 * CLEARING MOVED, IT DID NOT DISAPPEAR
 *
 * The native input needed no clear button of its own because the OS picker
 * already drew one. That picker is gone, so due-calendar.tsx now carries an
 * explicit clear control -- see its file comment. What has not changed is the
 * value that leaves this component when a date is cleared: `onChange(null)`,
 * same as the old `change` event with an empty string.
 *
 * WHAT OPENING THE POPOVER COSTS THE HOVER RULE BELOW
 *
 * A row's chip is invisible until the row is hovered or the chip has focus --
 * see the measured asymmetry a few paragraphs down for where that comes from.
 * Radix moves focus into the popover's content when it opens, and that
 * content is portalled to the end of `<body>`, outside this chip's DOM
 * subtree -- so `:focus-within` on the wrapper stops seeing it the moment the
 * calendar opens, which would fade the chip out from under an open calendar.
 * `open` is tracked in this component for exactly that one line: forcing
 * `opacity-100` whenever the popover is open, regardless of where focus
 * physically sits.
 *
 * The read-only version, for rows that record a date rather than set one, is
 * components/due-badge.tsx, and it builds its box out of the three exports
 * below so the two chips cannot drift apart.
 *
 * WHAT THE CLASSES HERE REPLACED, AND WHY THEY LOOK ASYMMETRIC
 *
 * due-chip.css said this with nine selectors of rising specificity, and the
 * winner was not always the one you would guess by reading them in order. Two
 * results are worth stating, because both are load-bearing and neither is
 * obvious:
 *
 *   A chip that HAS a date does not react to hover at all. `.due:hover` was
 *   two classes; `.duebox.set .due` was three, and the four urgency rules were
 *   four. The hover rule lost to every one of them, so the tint below is the
 *   whole answer for a dated chip in a row.
 *
 *   In the add form it lost only partly. `.add .due:hover` was three classes,
 *   which tied with `.duebox.set .due` and came later in the file, so it won
 *   the properties that rule set -- but the urgency rules were four classes
 *   and kept theirs. That is why `soon` picks up an accent background on hover
 *   and keeps its own border and text, while `overdue` and `today` do not move
 *   and `far` moves entirely. Measured against the running app before this
 *   file changed, not reasoned about afterwards.
 *
 * Utilities are in a later layer than the sheet was, so a state that used to
 * be won by stacking selectors has to be spelled where the answer is known --
 * which is here, since `dueInfo` already computes it.
 */

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { dueInfo, formatDue } from "../../shared/core.js";
import type { DueState } from "../../shared/types.js";
import { currentLanguage, t } from "../i18n.js";
import { cn } from "../react/cn.js";
import { CalendarIcon } from "../react/icons.js";
import { DueCalendar } from "./due-calendar.js";

/** The wrapper. `duebox` stays a class: selection.ts closes on it. */
export const DUE_BOX = "duebox inline-flex flex-none items-center";

/**
 * The face, at a row's size. `due` stays a class as well -- the picker's
 * pseudo-elements in due-chip.css are hung off it, and there is no element to
 * put a utility on.
 */
export const DUE_FACE = cn(
  "due relative inline-flex h-[20px] min-w-[24px] items-center justify-center",
  "rounded-sm border border-transparent px-sm text-xs leading-none",
  "whitespace-nowrap text-faint tabular-nums",
);

/**
 * The colours of a chip that has a date. `soon` names a background because the
 * rule it replaces did not: it inherited one from `.duebox.set .due`, and with
 * that rule gone the value has to be said out loud.
 */
export const DUE_TINT: Record<DueState, string> = {
  overdue: "border-danger bg-danger-soft text-danger",
  today: "border-accent bg-accent-soft text-accent",
  soon: "border-q3 bg-panel-2 text-q3",
  far: "border-line bg-panel-2 text-muted",
};

/**
 * What hovering an add form's chip changes, per state.
 *
 * No border moves any more: the add form's chip sits inside the text box now,
 * and a border there would be a second outline inside the first. The dated
 * states keep their fill and their text colour, which is what was carrying the
 * meaning -- an outlined red chip beside an input read as a field in error
 * rather than as a date that has passed.
 */
const ADD_HOVER: Record<DueState, string> = {
  overdue: "",
  today: "",
  soon: "hover:bg-accent-soft",
  far: "hover:bg-accent-soft hover:text-accent",
};

/**
 * The add form's chip: smaller than a row's, and borderless.
 *
 * It is inside the box rather than beside it, so the box's own edge is the
 * only one. Its width changing as a date is chosen now costs nothing -- the
 * text box was always the thing that gives up width, and nothing to its right
 * moves. That was the whole reason for the change.
 */
const ADD_FACE = "h-[22px] min-w-[22px] rounded-sm border-transparent px-sm";

interface Props {
  /** 'YYYY-MM-DD', or null for a chip with no date on it yet. */
  value: string | null;
  /** The new date, or null when it was cleared. */
  onChange: (next: string | null) => void;
  /**
   * The add form's chip rather than a row's: bigger, always visible, and it
   * answers hover in the accent instead of the neutral tints. A row's chip
   * hides until the row is hovered, which is a thing only the row can say.
   */
  inAddForm?: boolean;
  /**
   * Extra classes for the trigger itself, merged last.
   *
   * It exists for one caller: the add form groups this chip with its submit
   * into a single control, and the two facing corners have to be flattened.
   * Which corners those are is the group's business, not the chip's -- a
   * `grouped` prop here would make this file know about an arrangement it
   * cannot see.
   */
  className?: string;
}

export function DueChip({ value, onChange, inAddForm, className }: Props) {
  const info = dueInfo(value);
  // formatDue answers null only for a null info, which is the branch below.
  const words = info ? formatDue(info, t, currentLanguage())! : null;
  const [open, setOpen] = useState(false);

  return (
    <span
      className={cn(DUE_BOX, info && `set ${info.state}`)}
      // The row this sits in is draggable, and a drag started on the chip
      // would take the row instead of opening the calendar. A <button>
      // is not draggable by default, but this stays for the row's own
      // pointerdown handler, which does not know what it landed on.
      draggable={false}
    >
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className={cn(
              DUE_FACE,
              info
                ? DUE_TINT[info.state]
                : inAddForm
                  ? "bg-panel-2 text-muted"
                  : // Out of the way until the row is hovered -- `group` is on
                    // the row, in components/row.tsx -- or until the trigger
                    // has focus, which is how a keyboard reaches it.
                    "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
              // Forced back on while the calendar is open -- see the file
              // comment for why `focus-within` alone stops covering this.
              !inAddForm && !info && open && "opacity-100",
              inAddForm
                ? info
                  ? ADD_HOVER[info.state]
                  : "hover:border-accent hover:bg-accent-soft hover:text-accent"
                : // A dated chip in a row does not answer hover at all; only
                  // the empty one does.
                  !info &&
                    "hover:border-line-strong hover:bg-panel-3 hover:text-text",
              // Last, so it takes the border off whatever tint was chosen
              // above rather than being overwritten by it.
              inAddForm && ADD_FACE,
              className,
            )}
            aria-label={t("due.field")}
            title={
              words
                ? t("due.chip", { date: words.text, hint: words.hint })
                : t("due.set")
            }
          >
            {/* The face carries either the date text or, when there is no
                date, the calendar icon. An inline <svg> is placed on the text
                baseline, not on the box's centre, which left the icon 0.7px
                high while the drawn + beside it measured exact. Block display
                takes it out of inline flow, and the flexbox above centres
                it. */}
            <span className="face [&>svg]:block">
              {words ? words.text : <CalendarIcon />}
            </span>
          </button>
        </Popover.Trigger>
        <DueCalendar
          value={value}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      </Popover.Root>
    </span>
  );
}
