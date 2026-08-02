/**
 * Editing a task's text in place, shared by the matrix rows and the inbox rows.
 *
 * It is contentEditable rather than a swapped-in <input> so the row does not
 * change size or lose its place in the list while it is being edited.
 */

import { editTask } from '../store.js';
import { notify } from '../render-bus.js';

/**
 * Turn `textEl` into an editor with everything selected, and keep it there
 * until Enter (commit), Escape (revert) or a blur (commit — clicking away is
 * how most people finish).
 *
 * Dragging is switched off for the duration: the row is draggable, and a
 * text selection inside a draggable element starts a drag instead of selecting.
 */
export function startEdit(li, textEl, task) {
  const original = task.text;
  li.draggable = false;
  textEl.contentEditable = 'true';
  textEl.focus();

  const range = document.createRange();
  range.selectNodeContents(textEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  /** Leave edit mode; `commit` decides whether the typing survives. */
  const finish = (commit) => {
    // Unhook first. Clearing contentEditable on a focused element blurs it, so
    // doing that while onBlur is still attached re-enters finish(true) — and an
    // Escape would save the edit it was cancelling.
    textEl.removeEventListener('keydown', onKey);
    textEl.removeEventListener('blur', onBlur);
    textEl.contentEditable = 'false';
    li.draggable = true;
    if (commit) editTask(task.id, textEl.textContent);
    else textEl.textContent = original;
    // editTask() saves without redrawing, so the one render happens here —
    // it also puts back a row that was emptied and therefore deleted.
    notify();
  };

  const onKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    }
  };
  const onBlur = () => finish(true);

  textEl.addEventListener('keydown', onKey);
  textEl.addEventListener('blur', onBlur);
}
