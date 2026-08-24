/**
 * Turning the task list into a document's worth of rows.
 *
 * Only what is on screen is exported: one matrix -- Work or Life -- with its
 * dump and its four quadrants. Completed and trashed rows belong to the
 * history and trash tabs, and the other board belongs to its own export.
 */

import {
  QUADS,
  INBOX,
  compareOrder,
  dueInfo,
  formatDue,
  normalizeTasks,
  sanitizeSpace,
} from "../core.js";
import type { Place, Space, Task } from "../types.js";
import type { ExportItem, ExportSection, I18n, Snapshot } from "./types.js";

/** Two-digit number for the date and time stamps. */
const pad = (n: number) => String(n).padStart(2, "0");

/** 'YYYY-MM-DD', built locally so it matches the day the user sees. */
export function isoDay(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Stamp in the document header: '2026-08-02 14:30'. */
export function stampLabel(now: Date = new Date()): string {
  return `${isoDay(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/**
 * Suggested save name; the extension picks the format in main.js. The board's
 * name is in there because the two matrices export separately — without it the
 * second file would be offered the name of the first.
 */
export function defaultFileName(
  now: Date = new Date(),
  ext: string = "pdf",
  space: unknown,
  t: I18n["t"],
): string {
  return `Nekan ${t(`space.${sanitizeSpace(space)}`)} ${isoDay(now)}.${ext}`;
}

/**
 * One task, reduced to what a document needs. The live urgency is resolved
 * here because a printed page cannot recompute it later.
 */
function exportItem(task: Task, now: Date, { t, locale }: I18n): ExportItem {
  const info = dueInfo(task.dueDate, now);
  // formatDue answers null for a null info and only then, so the two are
  // present or absent together. Written as a test rather than leaned on,
  // because that pairing is core's promise and nothing here would notice it
  // being broken.
  const due = info ? formatDue(info, t, locale) : null;
  return {
    text: task.text,
    // Both parts are kept: the date survives printing, the hint ("3 days left")
    // is what makes it readable at a glance on the day it was exported.
    due: due
      ? {
          text: due.text,
          hint: due.hint,
          state: info!.state,
          // Markdown runs the two into a sentence, HTML sets them side by side.
          // Only the first needs words of its own.
          line: t("export.due", { date: due.text, hint: due.hint }),
        }
      : null,
    memo: task.memo || null,
  };
}

/**
 * One matrix, in the order the lists show it. `normalizeTasks` runs first
 * because the main process holds data.json as it was read: a task saved before
 * a field existed, or with a quadrant this version does not know, has to land
 * in the same place the UI would put it rather than vanish from the export.
 * It is also what puts every pre-split task on a board, and guarantees inbox
 * tasks have no space — which is why they survive the filter on both boards.
 */
/** How many rows of any one list reach the page. See the note in buildSnapshot. */
const PER_SECTION = 20;

export function buildSnapshot(
  tasks: unknown,
  now: Date = new Date(),
  space: unknown,
  i18n: I18n,
): Snapshot {
  const { t, locale } = i18n;
  const board = sanitizeSpace(space);
  // core.js is still untyped JavaScript, so its return has to be named here.
  // The cast goes when core converts; it is not covering anything up, since
  // normalizeTasks is exactly the function that makes this true.
  const list = (normalizeTasks(tasks) as Task[]).filter(
    (t) =>
      !t.purgedAt &&
      !t.completedAt &&
      !t.deletedAt &&
      (t.space === null || t.space === board),
  );
  // Same order the quadrant shows: the array is storage order, `orderKey` is
  // the user's. normalizeTasks() above has already given every row one.
  const inList = (q: Place) =>
    list.filter((t) => t.quadrant === q).sort(compareOrder);

  // Every list gets the same ceiling, and the section says how many it left.
  //
  // Not a formatting preference -- the printed matrix is a two-column grid, and
  // a grid row is as tall as its tallest cell. Measured 2026-08-18 with 300
  // tasks in quadrant 2: the document ran to 11 pages, quadrant 1 became a
  // 6129px box holding one task and nine pages of white, and quadrants 3 and 4
  // came out at the very end. Past roughly 25 rows a quadrant stops fitting a
  // page, so the ceiling sits below that.
  //
  // The dump is capped too. It prints full width above the matrix, so a long
  // one pushes the whole board off the first page for the same reason.
  const section = (
    key: Place,
    title: string,
    action: string,
    quadrant: Place,
  ): ExportSection => {
    const all = inList(quadrant);
    const shown = all.slice(0, PER_SECTION);
    const hidden = all.length - shown.length;
    return {
      key,
      title,
      action,
      items: shown.map((task) => exportItem(task, now, i18n)),
      // What the quadrant really holds, which is not what is on the page.
      count: all.length,
      hidden,
      more: hidden ? t("export.more", { count: hidden }) : "",
    };
  };

  const sections = [
    section(
      INBOX as Place,
      t("inbox.title"),
      t("export.inboxAction"),
      INBOX as Place,
    ),
    ...(QUADS as Place[]).map((q) =>
      section(q, t(`quad.${q}.title`), t(`quad.${q}.action`), q),
    ),
  ];

  const stamp = stampLabel(now);
  // The board's size, not the document's: a count that dropped to 100 whenever
  // someone had more would read as tasks having gone missing.
  const total = sections.reduce((sum, s) => sum + s.count, 0);
  const truncated = sections.some((s) => s.hidden > 0);

  return {
    stamp,
    space: board,
    spaceLabel: t(`space.${board}`),
    total,
    truncated,
    perSection: PER_SECTION,
    inbox: sections[0],
    quads: sections.slice(1),
    sections,
    // Everything the two formatters below would otherwise have to ask for. They
    // are handed the finished document, not a catalogue.
    lang: locale,
    labels: {
      meta: t("export.meta", { stamp, count: total }),
      metaShort: t("export.metaShort", { stamp, count: total }),
      empty: t("export.sectionEmpty"),
      // Stated once, at the top, and only when it actually bit.
      limit: truncated ? t("export.limit", { limit: PER_SECTION }) : "",
    },
  };
}
