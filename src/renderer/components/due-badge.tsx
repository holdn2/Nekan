/**
 * A due date on a history or trash row: a record of what was set, not a
 * control. The editable one is components/due-chip.tsx, and this borrows its
 * box and its tints so the two cannot drift apart.
 *
 * Renders nothing when there is no date, so a caller can place it
 * unconditionally.
 */

import { dueInfo, formatDue } from "../../shared/core.js";
import { cn } from "../react/cn.js";
import { currentLanguage, t } from "../i18n.js";
import { DUE_BOX, DUE_FACE, DUE_TINT } from "./due-chip.js";

export function DueBadge({
  value,
  className,
}: {
  value: string | null;
  className?: string;
}) {
  const info = dueInfo(value);
  if (!info) return null;
  // formatDue answers null only for a null info, which is already handled.
  const { text, hint } = formatDue(info, t, currentLanguage())!;

  return (
    <span className={cn(DUE_BOX, "set readonly", info.state, className)}>
      {/* Faded and with the arrow cursor, because there is nothing here to
          click. It answers hover in none of the ways the editable chip does:
          the urgency tint outranked the hover rule in the sheet this replaced,
          and it still does -- there simply is no hover class to add. */}
      <span
        className={cn(
          DUE_FACE,
          DUE_TINT[info.state],
          "cursor-default opacity-75",
        )}
        title={t("due.chip", { date: text, hint })}
      >
        <span className="face">{text}</span>
      </span>
    </span>
  );
}
