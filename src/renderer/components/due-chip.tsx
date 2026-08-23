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
 * components/due-badge.tsx.
 */

import { dueInfo, formatDue } from "../../shared/core.js";
import { currentLanguage, t } from "../i18n.js";
import { CalendarIcon } from "../react/icons.js";

interface Props {
  /** 'YYYY-MM-DD', or null for a chip with no date on it yet. */
  value: string | null;
  /** The new date, or null when it was cleared. */
  onChange: (next: string | null) => void;
}

export function DueChip({ value, onChange }: Props) {
  const info = dueInfo(value);
  // formatDue answers null only for a null info, which is the branch below.
  const words = info ? formatDue(info, t, currentLanguage())! : null;

  return (
    <span
      className={info ? `duebox set ${info.state}` : "duebox"}
      // The row this sits in is draggable, and a drag started on the chip
      // would take the row instead of opening the picker.
      draggable={false}
    >
      <span
        className="due"
        title={
          words
            ? t("due.chip", { date: words.text, hint: words.hint })
            : t("due.set")
        }
      >
        <input
          type="date"
          value={value ?? ""}
          aria-label={t("due.field")}
          onChange={(e) => onChange(e.target.value || null)}
        />
        <span className="face">{words ? words.text : <CalendarIcon />}</span>
      </span>
    </span>
  );
}
