/**
 * A due date on a history or trash row: a record of what was set, not a
 * control. The editable one is components/due-chip.ts, which the matrix still
 * builds by hand.
 *
 * Renders nothing when there is no date, so a caller can place it
 * unconditionally.
 */

import { dueInfo, formatDue } from "../../shared/core.js";
import { currentLanguage, t } from "../i18n.js";

export function DueBadge({ value }: { value: string | null }) {
  const info = dueInfo(value);
  if (!info) return null;
  // formatDue answers null only for a null info, which is already handled.
  const { text, hint } = formatDue(info, t, currentLanguage())!;

  return (
    <span className={`duebox set ${info.state} static`}>
      <span className="due" title={t("due.chip", { date: text, hint })}>
        <span className="face">{text}</span>
      </span>
    </span>
  );
}
