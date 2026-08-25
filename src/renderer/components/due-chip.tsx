/**
 * A due date you can change: a native date input stretched invisibly over a
 * compact face, so a click anywhere on the chip opens the OS date picker.
 *
 * No clear button of its own -- the picker already has one, and a second way
 * to do the same thing was costing a control in every row and every add form.
 * Clearing arrives through the same change event, which is why removing it
 * cost nothing.
 *
 * The read-only version, for rows that record a date rather than set one, is
 * components/due-badge.tsx, and it builds its box out of the two exports
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

import { dueInfo, formatDue } from "../../shared/core.js";
import type { DueState } from "../../shared/types.js";
import { currentLanguage, t } from "../i18n.js";
import { cn } from "../react/cn.js";
import { CalendarIcon } from "../react/icons.js";

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

/** What hovering an add form's chip changes, per state. See the note above. */
const ADD_HOVER: Record<DueState, string> = {
  overdue: "",
  today: "",
  soon: "hover:bg-accent-soft",
  far: "hover:border-accent hover:bg-accent-soft hover:text-accent",
};

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
}

export function DueChip({ value, onChange, inAddForm }: Props) {
  const info = dueInfo(value);
  // formatDue answers null only for a null info, which is the branch below.
  const words = info ? formatDue(info, t, currentLanguage())! : null;

  return (
    <span
      className={cn(DUE_BOX, info && `set ${info.state}`)}
      // The row this sits in is draggable, and a drag started on the chip
      // would take the row instead of opening the picker.
      draggable={false}
    >
      <span
        className={cn(
          DUE_FACE,
          inAddForm && "h-[30px] min-w-[30px] rounded-md",
          info
            ? DUE_TINT[info.state]
            : inAddForm
              ? "border-line-strong bg-panel-2"
              : // Out of the way until the row is hovered -- `group` is on the
                // row, in components/row.tsx -- or until the picker has focus,
                // which is how a keyboard reaches it.
                "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
          inAddForm
            ? info
              ? ADD_HOVER[info.state]
              : "hover:border-accent hover:bg-accent-soft hover:text-accent"
            : // A dated chip in a row does not answer hover at all; only the
              // empty one does.
              !info &&
                "hover:border-line-strong hover:bg-panel-3 hover:text-text",
        )}
        title={
          words
            ? t("due.chip", { date: words.text, hint: words.hint })
            : t("due.set")
        }
      >
        {/* The native input sits invisibly on top so a click anywhere opens
            the picker. Only its calendar indicator is left, stretched to fill
            the chip -- that part is in due-chip.css, where the pseudo-elements
            have to live. */}
        <input
          className={cn(
            "absolute inset-[0px] m-[0px] h-full w-full cursor-pointer",
            "border-0 p-[0px] opacity-0",
          )}
          type="date"
          value={value ?? ""}
          aria-label={t("due.field")}
          onChange={(e) => onChange(e.target.value || null)}
        />
        {/* The face carries either the date text or, when there is no date,
            the calendar icon. An inline <svg> is placed on the text baseline,
            not on the box's centre, which left the icon 0.7px high while the
            drawn + beside it measured exact. Block display takes it out of
            inline flow, and the flexbox above centres it. */}
        <span className="face [&>svg]:block">
          {words ? words.text : <CalendarIcon />}
        </span>
      </span>
    </span>
  );
}
