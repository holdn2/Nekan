/**
 * The one-off confirmation strip at the bottom of the window.
 *
 * It exists for things that happen *outside* the window — a file written to
 * disk — where nothing on screen would otherwise change to say they worked.
 * Anything the lists already show is not toast material.
 */

import { $ } from '../dom.js';

let toastTimer = null;

/**
 * Show `message` for `ms`. `error` tints it red, and `action`
 * ({ label, onClick }) adds a single button — cleared on every call so a stale
 * one from an earlier toast can never linger with the wrong handler.
 */
export function toast(message, { error = false, action = null, ms = 4000 } = {}) {
  const box = $('#toast');
  const act = $('#toastAct');
  $('#toastText').textContent = message;
  box.classList.toggle('error', error);

  act.classList.toggle('hidden', !action);
  act.onclick = action ? action.onClick : null;
  if (action) act.textContent = action.label;

  box.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.add('hidden'), ms);
}
