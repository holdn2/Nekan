/**
 * The four quadrants: the rows in them and the add form under each one.
 *
 * Rendering is a full replaceChildren() per quadrant on every change. The lists
 * are short enough that rebuilding them costs nothing, and it removes a whole
 * class of bug — there is no partial update that can disagree with the store.
 */

import { QUADS } from '../core-bridge.js';
import { $, $$, numEl } from '../dom.js';
import { dueChip } from '../components/due-chip.js';
import { memoMark } from '../components/memo-mark.js';
import { activeOf, addTask, completeTask, deleteTask, setDue } from '../store.js';
import { isSelected, wireRowSelection } from './memo.js';
import { startEdit } from './inline-edit.js';

/** Matches the row's fade-out in styles.css, so the change lands unseen. */
const REMOVE_MS = 160;

/**
 * One quadrant row: complete, text, memo marker, due chip, delete. `index` is
 * only its position in the list on screen — the "1." in front of it.
 */
export function itemEl(task, index) {
  const li = document.createElement('li');
  li.className = isSelected(task.id) ? 'item selected' : 'item';
  li.dataset.id = task.id;
  li.draggable = true;

  const check = document.createElement('button');
  check.className = 'check';
  check.title = '완료 (히스토리로 이동)';
  // Icon-only buttons: without this a screen reader announces "button".
  check.setAttribute('aria-label', `완료: ${task.text}`);
  check.addEventListener('click', () => {
    li.classList.add('removing');
    setTimeout(() => completeTask(task.id), REMOVE_MS);
  });

  const text = document.createElement('span');
  text.className = 'text';
  text.textContent = task.text;
  text.title = '클릭하여 메모 · 더블클릭하여 수정';
  text.addEventListener('dblclick', () => startEdit(li, text, task));

  const due = dueChip(task.dueDate, (value) => setDue(task.id, value));

  const del = document.createElement('button');
  del.className = 'del';
  del.textContent = '×';
  del.title = '삭제 (휴지통으로 이동)';
  del.setAttribute('aria-label', `삭제: ${task.text}`);
  del.addEventListener('click', () => {
    li.classList.add('removing');
    setTimeout(() => deleteTask(task.id), REMOVE_MS);
  });

  li.append(numEl(index), check, text);
  if (task.memo) li.append(memoMark(task.memo));
  li.append(due, del);

  wireRowSelection(li, text, task);
  return li;
}

/** Redraw all four quadrants and the count in each header. */
export function renderMatrix() {
  QUADS.forEach((q) => {
    const list = $(`[data-list="${q}"]`);
    const items = activeOf(q);
    list.replaceChildren(...items.map((task, i) => itemEl(task, i)));
    $(`[data-count="${q}"]`).textContent = String(items.length);
  });
}

/**
 * The per-quadrant add forms. Each gets a due chip injected before its submit
 * button so a date can be set as the task is typed, rather than after.
 *
 * The inbox form is excluded by selector, not by accident: it shares the .add
 * class for styling but has no `data-add` quadrant and no chip, and inbox.js
 * binds its own submit. Matching it here would file the task under `undefined`
 * and blank the input before that handler ever ran.
 */
export function wireAddForms() {
  $$('.add:not(.inbox-add)').forEach((form) => {
    const input = $('input[type="text"]', form);
    const chip = dueChip(null, () => {});
    form.insertBefore(chip, $('button[type="submit"]', form));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      addTask(form.dataset.add, input.value, chip.input.value);
      input.value = '';
      chip.apply('');
      input.focus();
    });
  });
}
