/**
 * The history and trash tabs. They are the same list rendered twice — same
 * layout, same day grouping, different timestamp and different buttons — so
 * one renderer takes both and only the differences are passed in.
 *
 * Neither tab can edit anything. A row here is a record: it can be moved back
 * into play (되돌리기 / 복원) or thrown further away, and that is all.
 */

import { $, $$, actionBtn, numEl } from '../dom.js';
import { dueBadge } from '../components/due-chip.js';
import { memoLine } from '../components/memo-mark.js';
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
} from '../store.js';

let historyQuery = '';
let trashQuery = '';

/** Tooltip on the coloured dot — where the task was when it left the matrix. */
const QUAD_LABEL = {
  inbox: '미분류',
  q1: 'Urgent·Important',
  q2: 'Important',
  q3: 'Urgent',
  q4: '기타',
};

const dayLabel = (ts) =>
  new Date(ts).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });

const timeLabel = (ts) =>
  new Date(ts).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
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
function renderArchive({ list, empty, items, query, stamp, emptyText, actions }) {
  list.replaceChildren();
  let lastDay = '';
  let index = 0;

  items.forEach((task) => {
    const day = dayLabel(stamp(task));
    if (day !== lastDay) {
      lastDay = day;
      index = 0;
      const head = document.createElement('li');
      head.className = 'day';
      head.textContent = day;
      list.append(head);
    }

    const li = document.createElement('li');
    li.className = 'hitem';

    const dot = document.createElement('span');
    dot.className = `dot ${task.quadrant}`;
    dot.title = QUAD_LABEL[task.quadrant] || '';

    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = task.text;

    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = timeLabel(stamp(task));

    // Title and memo share one column, so the memo lines up under the title
    // and stops where the date column starts instead of running alongside it.
    const main = document.createElement('div');
    main.className = 'hmain';
    main.append(text);
    if (task.memo) {
      main.append(memoLine(task.memo));
      li.classList.add('has-memo');
    }

    li.append(numEl(index), dot, main);
    const due = dueBadge(task.dueDate);
    if (due) li.append(due);
    li.append(time);
    actions(task).forEach((btn) => li.append(btn));
    list.append(li);
    index += 1;
  });

  // Measured after insertion: only a memo that is actually cut off gets the
  // pointer and the expand hint.
  $$('.hmemo', list).forEach((box) => {
    const text = $('.hmemo-text', box);
    const clamped = text.scrollHeight > text.clientHeight + 1;
    box.classList.toggle('clamped', clamped);
    if (clamped) box.title = '전체 보기';
  });

  empty.classList.toggle('hidden', items.length > 0);
  empty.textContent = query.trim() ? '검색 결과가 없습니다.' : emptyText;
}

/** Completed tasks, newest first. */
export function renderHistory() {
  renderArchive({
    list: $('#historyList'),
    empty: $('#historyEmpty'),
    items: doneTasks().filter((t) => matches(t, historyQuery)),
    query: historyQuery,
    stamp: (t) => t.completedAt,
    emptyText: '완료한 항목이 아직 없습니다.',
    actions: (task) => [
      actionBtn('되돌리기', () => restoreTask(task.id)),
      actionBtn('삭제', () => deleteTask(task.id), true),
    ],
  });
}

/** Soft-deleted tasks, newest first. The only place purge is reachable. */
export function renderTrash() {
  renderArchive({
    list: $('#trashList'),
    empty: $('#trashEmpty'),
    items: trashedTasks().filter((t) => matches(t, trashQuery)),
    query: trashQuery,
    stamp: (t) => t.deletedAt,
    emptyText: '휴지통이 비어 있습니다.',
    actions: (task) => [
      actionBtn('복원', () => untrashTask(task.id)),
      actionBtn('영구 삭제', () => purgeTask(task.id), true),
    ],
  });
}

/**
 * Search boxes and the three bulk buttons.
 *
 * Each bulk action hands the store the list the tab just rendered rather than a
 * condition to filter by: those lists are already scoped to the board on screen,
 * and the other board's rows must not go out with them.
 */
export function wireArchive() {
  $('#historySearch').addEventListener('input', (e) => {
    historyQuery = e.target.value;
    renderHistory();
  });

  $('#trashSearch').addEventListener('input', (e) => {
    trashQuery = e.target.value;
    renderTrash();
  });

  $('#clearHistory').addEventListener('click', () => {
    const items = doneTasks();
    if (!items.length) return;
    if (!window.confirm(`완료한 항목 ${items.length}개를 휴지통으로 옮길까요?`))
      return;
    trashAll(items);
  });

  $('#restoreAll').addEventListener('click', () => {
    untrashAll(trashedTasks());
  });

  $('#emptyTrash').addEventListener('click', () => {
    const items = trashedTasks();
    if (!items.length) return;
    if (
      !window.confirm(
        `휴지통의 ${items.length}개 항목을 영구 삭제할까요? 되돌릴 수 없습니다.`,
      )
    )
      return;
    purgeAll(items);
  });
}
