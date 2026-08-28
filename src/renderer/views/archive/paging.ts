/**
 * Which page of a finished list is drawn, and how one row is labelled.
 *
 * A history of two thousand is ordinary after a few months, and drawing it
 * costs about 180us a row -- a third of a second before anything appears. It
 * used to draw a hundred and grow by a hundred on demand, which meant the cost
 * only ever went up: somebody who pressed 더 보기 into the thousands paid for
 * that press on every later keystroke and every later redraw, with nothing on
 * screen explaining why. Now a page is a page. Twenty rows is what fits the
 * window without scrolling, and the twenty-first is a page away in either
 * direction rather than four hundred rows further down.
 *
 * The search is still not paged in the sense that matters: it reads the whole
 * list and pages the matches, so a task from March is found and shown, not
 * missed because it fell outside the drawn rows.
 */

import type { Task } from "../../../shared/types.js";
import { currentLanguage, t } from "../../i18n.js";

const PAGE = 20;

/**
 * Which page each tab is on, counting from one.
 *
 * Module state rather than component state because window/chrome resets it
 * when the tab changes, and that call cannot reach inside a component. Two
 * entries, not one: both tabs are mounted at the same time and page 3 of the
 * history has nothing to do with page 3 of the trash.
 */
const page = { history: 1, trash: 1 };

/**
 * Back to the first page on both tabs.
 *
 * Called when the tab changes. Unchanged in contract from when it reset a
 * 더 보기 count -- the chrome asks for "start over" and this is what starting
 * over means now.
 */
function resetArchivePaging() {
  page.history = 1;
  page.trash = 1;
}

/**
 * How many pages `total` rows make. Never zero: an empty list is on page 1 of
 * 1, so that clamping a page against it cannot produce page 0.
 */
const pageCount = (total: number) => Math.max(1, Math.ceil(total / PAGE));

/**
 * A day, as something cheap to compare.
 *
 * Not dayLabel(): grouping now runs over the whole filtered list so a row's
 * number means its place in its day rather than its place on this page, and
 * two thousand trips through Intl every redraw is a cost worth not paying when
 * only the twenty drawn rows need words. Local getters on purpose -- a "day"
 * here is the one the person was in, which is what the header says too.
 */
const dayKey = (ts: number) => {
  const d = new Date(ts);
  return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
};

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
  page,
  pageCount,
  resetArchivePaging,
  QUAD_LABEL,
  dayKey,
  dayLabel,
  timeLabel,
  matches,
};
