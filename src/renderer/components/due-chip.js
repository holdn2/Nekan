/**
 * The due-date chip in its two forms: editable on the matrix, read-only in the
 * history and trash lists.
 *
 * All the urgency wording ("오늘", "3일 남음") and the state class that colours
 * it come from `dueInfo()` in shared/core.js, so this file only decides what the
 * chip looks like — never what a date means.
 */

import { dueInfo } from '../core-bridge.js';
import { calendarIcon } from './icons.js';

/**
 * Editable chip: a native date input stretched invisibly over a compact face,
 * so a click anywhere on it opens the OS date picker. Returns the wrapper with
 * two extras hung off it — `input` (so the add form can read the value it holds
 * before a task exists) and `apply` (so the form can reset the face after
 * submitting).
 *
 * `onChange` receives the new 'YYYY-MM-DD' string, or null when it is cleared.
 */
export function dueChip(value, onChange) {
  const box = document.createElement('span');
  const chip = document.createElement('span');
  chip.className = 'due';

  const input = document.createElement('input');
  input.type = 'date';
  input.setAttribute('aria-label', '마감일');

  const face = document.createElement('span');
  face.className = 'face';
  chip.append(input, face);

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'due-clear';
  clear.textContent = '×';
  clear.title = '날짜 지우기';
  clear.setAttribute('aria-label', '마감일 지우기');

  box.append(chip, clear);
  box.draggable = false;

  /** Repaint the face for `next`; an empty date falls back to the icon. */
  const apply = (next) => {
    input.value = next || '';
    const info = dueInfo(next);
    box.className = info ? `duebox set ${info.state}` : 'duebox';
    face.replaceChildren();
    if (info) {
      face.textContent = info.text;
      chip.title = `마감 ${info.text} · ${info.hint}`;
    } else {
      face.append(calendarIcon());
      chip.title = '마감일 지정';
    }
  };

  input.addEventListener('change', () => {
    apply(input.value);
    onChange(input.value || null);
  });
  clear.addEventListener('click', (e) => {
    // The row underneath treats a click as "select for the memo panel".
    e.stopPropagation();
    apply('');
    onChange(null);
  });

  apply(value);
  box.input = input;
  box.apply = apply;
  return box;
}

/**
 * Read-only version for history / trash rows, where a date is a record of what
 * was set rather than something to change. Returns null when there is no date,
 * so the caller can simply skip appending it.
 */
export function dueBadge(value) {
  const info = dueInfo(value);
  if (!info) return null;
  const box = document.createElement('span');
  box.className = `duebox set ${info.state} static`;
  const chip = document.createElement('span');
  chip.className = 'due';
  chip.title = `마감 ${info.text} · ${info.hint}`;
  const face = document.createElement('span');
  face.className = 'face';
  face.textContent = info.text;
  chip.append(face);
  box.append(chip);
  return box;
}
