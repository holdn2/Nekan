/**
 * The history and trash tabs. They are the same list rendered twice — same
 * layout, same day grouping, different timestamp and different buttons — so
 * one renderer takes both and only the differences are passed in.
 *
 * Neither tab can edit anything. A row here is a record: it can be moved back
 * into play (되돌리기 / 복원) or thrown further away, and that is all.
 */

import { $, $$, actionBtn, numEl } from "../dom.js";
import { currentLanguage, t } from "../i18n.js";
import { dueBadge } from "../components/due-chip.js";
import { memoLine } from "../components/memo-mark.js";
import {
  deleteTask,
  doneTasks,
  purgeAll,
  purgeTask,
  restoreTask,
  trashAll,
  trashedTasks,
  untrashAll,
  untrashTask,
} from "../store.js";

/**
 * How many rows either tab draws before it stops and offers a button.
 *
 * A row costs about 180µs to build and lay out, measured at 2,084 of them
 * (322/355/374/431/451ms across five runs). The search box re-renders on every
 * keystroke, so the budget is one keystroke inside 100ms: 100 rows is 18ms, 200
 * is 36ms, 500 is 90ms and already at the edge.
 *
 * 100 rather than the 200 this started at. Both are comfortably inside the
 * budget, so the number is not really about speed any more -- it is about how
 * much a list is allowed to weigh before it says so. At fifteen visible rows in
 * a default window this is still seven screens of scrolling.
 *
 * The data is never cut -- only what gets built. Search still looks at all of
 * it; see renderHistory.
 */
const PAGE = 100;

let historyQuery = "";
let trashQuery = "";
/** Rows currently drawn per tab. Grows by PAGE, resets when the view changes. */
let historyShown = PAGE;
let trashShown = PAGE;

/** Tooltip on the coloured dot — where the task was when it left the matrix. */
const QUAD_LABEL = {
  inbox: () => t("archive.quadInbox"),
  q1: () => "Urgent·Important",
  q2: () => "Important",
  q3: () => "Urgent",
  q4: () => t("archive.quadOther"),
};

/** Day header, in whatever the interface language says it looks like. */
const dayLabel = (ts) =>
  new Date(ts).toLocaleDateString(currentLanguage(), {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

/** Time column on a row, to the minute. */
const timeLabel = (ts) =>
  new Date(ts).toLocaleTimeString(currentLanguage(), {
    hour: "2-digit",
    minute: "2-digit",
  });

/** Case-insensitive substring match; an empty query matches everything. */
const matches = (task, query) => {
  const q = query.trim().toLowerCase();
  return !q || task.text.toLowerCase().includes(q);
};

/**
 * Shared renderer for both tabs: rows grouped by day, numbered from 1 within
 * each day.
 *
 * `stamp` picks which timestamp the grouping and the time column use
 * (completedAt or deletedAt) and `actions` supplies the buttons for a row.
 */
function renderArchive({
  list,
  empty,
  items,
  query,
  stamp,
  emptyKey,
  actions,
  shown,
  showMore,
}) {
  list.replaceChildren();
  let lastDay = "";
  let index = 0;

  const drawn = items.slice(0, shown);

  drawn.forEach((task) => {
    const day = dayLabel(stamp(task));
    if (day !== lastDay) {
      lastDay = day;
      index = 0;
      const head = document.createElement("li");
      head.className = "day";
      head.textContent = day;
      list.append(head);
    }

    const li = document.createElement("li");
    li.className = "hitem";

    const dot = document.createElement("span");
    dot.className = `dot ${task.quadrant}`;
    dot.title = QUAD_LABEL[task.quadrant]?.() || "";

    const text = document.createElement("span");
    text.className = "text";
    text.textContent = task.text;

    const time = document.createElement("span");
    time.className = "time";
    time.textContent = timeLabel(stamp(task));

    // Title and memo share one column, so the memo lines up under the title
    // and stops where the date column starts instead of running alongside it.
    const main = document.createElement("div");
    main.className = "hmain";
    main.append(text);
    if (task.memo) {
      main.append(memoLine(task.memo));
      li.classList.add("has-memo");
    }

    li.append(numEl(index), dot, main);
    const due = dueBadge(task.dueDate);
    if (due) li.append(due);
    li.append(time);
    actions(task).forEach((btn) => li.append(btn));
    list.append(li);
    index += 1;
  });

  // The rest are there, they are just not drawn. Saying how many is the point:
  // a list that stops without a word is indistinguishable from data that is
  // gone, and this list is the one people come to when they think something is
  // missing.
  const remaining = items.length - drawn.length;
  if (remaining > 0) {
    const li = document.createElement("li");
    li.className = "more";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = t("archive.more", { count: remaining });
    btn.addEventListener("click", showMore);
    li.append(btn);
    list.append(li);
  }

  // Measured after insertion: only a memo that is actually cut off gets the
  // pointer and the expand hint.
  $$(".hmemo", list).forEach((box) => {
    const text = $(".hmemo-text", box);
    const clamped = text.scrollHeight > text.clientHeight + 1;
    box.classList.toggle("clamped", clamped);
    if (clamped) box.title = t("archive.expand");
  });

  empty.classList.toggle("hidden", items.length > 0);
  empty.textContent = query.trim() ? t("archive.noResults") : t(emptyKey);
}

/**
 * Completed tasks, newest first.
 *
 * The filter runs over everything and the limit is applied after it, never the
 * other way round. Searching the drawn rows instead would mean a task stops
 * being findable at the moment it scrolls past the limit — which is exactly
 * when someone would go looking for it.
 */
export function renderHistory() {
  renderArchive({
    list: $("#historyList"),
    empty: $("#historyEmpty"),
    items: doneTasks().filter((task) => matches(task, historyQuery)),
    query: historyQuery,
    stamp: (task) => task.completedAt,
    emptyKey: "archive.historyEmpty",
    shown: historyShown,
    showMore: () => {
      historyShown += PAGE;
      renderHistory();
    },
    actions: (task) => [
      actionBtn(t("archive.restore"), () => restoreTask(task.id)),
      actionBtn(t("archive.delete"), () => deleteTask(task.id), true),
    ],
  });
}

/** Soft-deleted tasks, newest first. The only place purge is reachable. */
export function renderTrash() {
  renderArchive({
    list: $("#trashList"),
    empty: $("#trashEmpty"),
    items: trashedTasks().filter((task) => matches(task, trashQuery)),
    query: trashQuery,
    stamp: (task) => task.deletedAt,
    emptyKey: "archive.trashEmpty",
    shown: trashShown,
    showMore: () => {
      trashShown += PAGE;
      renderTrash();
    },
    actions: (task) => [
      actionBtn(t("archive.untrash"), () => untrashTask(task.id)),
      actionBtn(t("archive.purge"), () => purgeTask(task.id), true),
    ],
  });
}

/**
 * Back to one page on both tabs.
 *
 * Called when the tab changes, because an expanded list that stays expanded is
 * a slow list forever: someone who once pressed 더 보기 into the thousands
 * would pay for it on every keystroke and every redraw from then on, with
 * nothing on screen explaining why.
 */
export function resetArchivePaging() {
  historyShown = PAGE;
  trashShown = PAGE;
}

/**
 * Search boxes and the three bulk buttons.
 *
 * Each bulk action hands the store the list the tab just rendered rather than a
 * condition to filter by: those lists are already scoped to the board on screen,
 * and the other board's rows must not go out with them.
 */
export function wireArchive() {
  // Typing changes which rows these are, so the count of them starts over too.
  // Carrying it across would leave a two-character search rendering thousands.
  $("#historySearch").addEventListener("input", (e) => {
    historyQuery = e.target.value;
    historyShown = PAGE;
    renderHistory();
  });

  $("#trashSearch").addEventListener("input", (e) => {
    trashQuery = e.target.value;
    trashShown = PAGE;
    renderTrash();
  });

  $("#clearHistory").addEventListener("click", () => {
    const items = doneTasks();
    if (!items.length) return;
    if (!window.confirm(t("archive.confirmTrashAll", { count: items.length })))
      return;
    trashAll(items);
  });

  $("#restoreAll").addEventListener("click", () => {
    untrashAll(trashedTasks());
  });

  $("#emptyTrash").addEventListener("click", () => {
    const items = trashedTasks();
    if (!items.length) return;
    if (!window.confirm(t("archive.confirmPurgeAll", { count: items.length })))
      return;
    purgeAll(items);
  });
}
