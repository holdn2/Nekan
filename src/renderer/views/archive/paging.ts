/**
 * How many rows of a finished list are drawn, and how one is labelled.
 *
 * A history of two thousand is ordinary after a few months, and drawing it
 * costs about 180us a row -- a third of a second before anything appears. So
 * the tabs draw a page and grow it on demand. The search is deliberately not
 * paged: it reads the whole list, or a task from March would be missing rather
 * than merely further down.
 */

import type { Task } from "../../../shared/types.js";
import { currentLanguage, t } from "../../i18n.js";

const PAGE = 100;

/**
 * How many rows each tab is currently drawing.
 *
 * Module state rather than component state because window/chrome resets it
 * when the tab changes, and that call cannot reach inside a component. See
 * resetArchivePaging.
 */
const shown = { history: PAGE, trash: PAGE };

/**
 * Back to one page on both tabs.
 *
 * Called when the tab changes, because an expanded list that stays expanded is
 * a slow list forever: someone who once pressed 더 보기 into the thousands
 * would pay for it on every keystroke and every redraw from then on, with
 * nothing on screen explaining why.
 */
function resetArchivePaging() {
  shown.history = PAGE;
  shown.trash = PAGE;
}

/** What the coloured dot on a row means. */
const QUAD_LABEL: Record<string, () => string> = {
  q1: () => t("archive.quadQ1"),
  q2: () => t("archive.quadQ2"),
  q3: () => t("archive.quadQ3"),
  q4: () => t("archive.quadOther"),
};

/** Day header, in whatever the interface language says it looks like. */
const dayLabel = (ts: number) =>
  new Date(ts).toLocaleDateString(currentLanguage(), {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

/** Time column on a row, to the minute. */
const timeLabel = (ts: number) =>
  new Date(ts).toLocaleTimeString(currentLanguage(), {
    hour: "2-digit",
    minute: "2-digit",
  });

/** Case-insensitive substring match; an empty query matches everything. */
const matches = (task: Task, query: string) => {
  const q = query.trim().toLowerCase();
  return !q || task.text.toLowerCase().includes(q);
};

export {
  PAGE,
  shown,
  resetArchivePaging,
  QUAD_LABEL,
  dayLabel,
  timeLabel,
  matches,
};
