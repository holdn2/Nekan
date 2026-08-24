/**
 * Days, due dates and how a due date reads.
 *
 * dueInfo() computes and formatDue() writes, and they are apart for a reason:
 * shared/ cannot hold a catalogue -- i18next is initialised once by main and
 * once by the renderer, and neither of them is here -- so the words arrive as
 * a `t` the caller passes in. `state` stays on the computing side because CSS
 * keys off it.
 */

import type { DueInfo, DueState } from "../types.js";

export const DAY_MS = 86400000;

export function startOfToday(now = new Date()) {
  const d = new Date(now.getTime());
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Next local midnight. Built by day arithmetic instead of `+ DAY_MS` so a DST
 * transition cannot put the rollover timer an hour off.
 */
export function startOfTomorrow(now = new Date()) {
  const d = startOfToday(now);
  d.setDate(d.getDate() + 1);
  return d;
}

/** 'YYYY-MM-DD' → Date at local midnight, or null when unset/invalid. */
export function parseDue(value: unknown): Date | null {
  const text = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [y, m, d] = text.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return null;
  // Reject roll-overs like 2026-02-31 → Mar 3.
  if (date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/**
 * What a due date *is*, relative to `now` — no words in it.
 *
 * This file cannot hold a catalogue: main and the renderer each initialise
 * their own i18next and this module knows about neither. That is why the split
 * exists at all -- the counting lives here and the wording lives in
 * `formatDue()` below, which is handed a `t` rather than reaching for one.
 *
 * `state` stays on this side even though it looks like presentation. It is what
 * the stylesheets colour the chip by, and moving it across would tie the CSS to
 * whichever language is on screen.
 *
 * Time-dependent, so anything rendered from it has to be redrawn when the day
 * changes — see scheduleDayRollover in renderer/app.js.
 */
export function dueInfo(
  value: unknown,
  now: Date = new Date(),
): DueInfo | null {
  const date = parseDue(value);
  if (!date) return null;
  const days = Math.round(
    (date.getTime() - startOfToday(now).getTime()) / DAY_MS,
  );

  let state: DueState = "far";
  if (days < 0) state = "overdue";
  else if (days === 0) state = "today";
  else if (days <= 3) state = "soon";

  // Comparing years needs `now`, which formatDue() does not get. A date in
  // another year is written differently, so the comparison belongs here with
  // everything else that had to look at the clock.
  return {
    date,
    days,
    state,
    otherYear: date.getFullYear() !== now.getFullYear(),
  };
}

/**
 * The two strings a due date shows: the date itself and how far away it is.
 *
 * `t` is passed in rather than imported — see dueInfo above for why this file
 * cannot hold a catalogue. Both the renderer and the export call this, so the
 * chip on screen and the chip in a printed PDF can never word the same date
 * differently.
 *
 * The weekday comes from `Intl` instead of the catalogue: it is the one part
 * every locale already knows, and a hand-written list would be seven more
 * strings per language to get wrong. The rest of the shape is deliberately not
 * `Intl`'s — a full Korean date formats as "8. 3. (월)", which is wider than the
 * chip and reads nothing like the "8/3" it has always shown.
 */
export function formatDue(
  info: DueInfo | null | undefined,
  t: (key: string, vars?: Record<string, unknown>) => string,
  locale: string,
): { text: string; hint: string } | null {
  if (!info) return null;
  const { date, days, otherYear } = info;

  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(
    date,
  );
  let text = `${date.getMonth() + 1}/${date.getDate()}(${weekday})`;
  if (otherYear) text = `${String(date.getFullYear()).slice(2)}/${text}`;

  let hint;
  if (days < 0) hint = t("due.overdue", { count: -days });
  else if (days === 0) hint = t("due.today");
  else if (days === 1) hint = t("due.tomorrow");
  else hint = t("due.remaining", { count: days });

  return { text, hint };
}
