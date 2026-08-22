/**
 * The four quadrants: the rows in them and the add form under each one.
 *
 * Rendering is a full replaceChildren() of whichever quadrant changed. Nothing
 * is patched in place, so there is no partial update that can disagree with the
 * store; the only thing kept between renders is a string saying what was drawn
 * last, and a quadrant whose string is unchanged is left alone. That matters
 * because every change redraws the matrix, and most changes belong to one
 * quadrant — see rowsKey.
 */

import { QUADS, isCrowded } from "../../shared/core.js";
import type { Place } from "../../shared/types.js";
import { currentLanguage, t } from "../i18n.js";
import { $, $$, numEl } from "../dom.js";
import { dueChip } from "../components/due-chip.js";
import { memoMark } from "../components/memo-mark.js";
import { closeIcon, plusIcon } from "../components/icons.js";
import {
  activeOf,
  addTask,
  completeTask,
  deleteTask,
  setDue,
} from "../store.js";
import { isSelected, wireRowSelection } from "../selection.js";
import { startEdit } from "./inline-edit.js";

/** Matches the row's fade-out in styles.css, so the change lands unseen. */
const REMOVE_MS = 160;

/**
 * One quadrant row: complete, text, memo marker, due chip, delete. `index` is
 * only its position in the list on screen — the "1." in front of it.
 */
export function itemEl(task, index) {
  const li = document.createElement("li");
  li.className = isSelected(task.id) ? "item selected" : "item";
  li.dataset.id = task.id;
  li.draggable = true;

  const check = document.createElement("button");
  check.className = "check";
  check.title = t("item.complete");
  // Icon-only buttons: without this a screen reader announces "button".
  check.setAttribute(
    "aria-label",
    t("item.completeLabel", { text: task.text }),
  );
  check.addEventListener("click", () => {
    // The row only leaves the DOM on the next render, which is REMOVE_MS away,
    // so the button stays clickable until then. Disable it here so a second
    // click cannot schedule the same change twice.
    check.disabled = true;
    li.classList.add("removing");
    setTimeout(() => completeTask(task.id), REMOVE_MS);
  });

  const text = document.createElement("span");
  text.className = "text";
  text.textContent = task.text;
  text.title = t("item.hint");
  text.addEventListener("dblclick", () => startEdit(li, text, task));

  const due = dueChip(task.dueDate, (value) => setDue(task.id, value));

  const del = document.createElement("button");
  del.className = "del";
  del.append(closeIcon());
  del.title = t("item.delete");
  del.setAttribute("aria-label", t("item.deleteLabel", { text: task.text }));
  del.addEventListener("click", () => {
    del.disabled = true;
    li.classList.add("removing");
    setTimeout(() => deleteTask(task.id), REMOVE_MS);
  });

  li.append(numEl(index), check, text);
  if (task.memo) li.append(memoMark(task.memo));
  li.append(due, del);

  wireRowSelection(li, text, task);
  return li;
}

/**
 * Everything a quadrant's rows are drawn from, in order.
 *
 * Only what itemEl() actually reads, and *all* of it — `selected` is a class
 * on the row, so leaving it out of here would mean clicking a task highlighted
 * nothing until something else forced a redraw. `updatedAt` would be one field
 * instead of five, but stamping it is the caller's job (see store.js touch), so
 * a mutation that forgot would stop redrawing as well as stop syncing: one bug
 * becoming two. Position comes for free — the list is joined in order, and the
 * "1." in front of each row is its index.
 *
 * The separators are escapes, never raw bytes. A 0x00 in a source file makes
 * ripgrep call the file binary and refuse to search it, and they have to be
 * characters task text cannot hold, or two rows could run together and a
 * redraw that was needed would be skipped.
 */
const rowsKey = (items) =>
  [
    // The language leads, because a row carries strings that are in no task at
    // all — the complete and delete titles, the "click for the note" hint, the
    // words on the due chip. Switching language redraws everything, and without
    // this the quadrants would be the one place that decided nothing changed.
    currentLanguage(),
    ...items.map(
      (t) =>
        `${t.id}\u0000${t.text}\u0000${t.dueDate || ""}` +
        `\u0000${t.memo ? 1 : 0}\u0000${isSelected(t.id) ? 1 : 0}`,
    ),
  ].join("\u0001");

/** The last rowsKey drawn into each quadrant. */
const drawn = new Map();

/** The four add-form chips, kept so their labels can be rewritten. */
const addChips = [];

/**
 * Repaint the add forms' due chips.
 *
 * They are built once by wireAddForms() and live for the whole run, so unlike a
 * row -- which is thrown away and rebuilt -- nothing gives them a new language
 * on its own. Re-applying the date they already hold is what does it, because
 * dueChip.apply() writes its fixed labels as well as its face.
 *
 * Called from the render dispatcher rather than from renderMatrix() below: the
 * matrix only redraws on its own tab, and a language switched while the guide
 * was open would leave four Korean tooltips in the document until somebody came
 * back. Nobody could see them there, which is exactly what makes it the kind of
 * thing to fix rather than to remember.
 */
export function relabelAddForms() {
  addChips.forEach((chip) => chip.apply(chip.input.value));
}

/** Redraw all four quadrants and the count in each header. */
export function renderMatrix() {
  QUADS.forEach((q) => {
    const list = $(`[data-list="${q}"]`);
    const items = activeOf(q);
    // Every change redraws the whole matrix, and most changes belong to one
    // quadrant: adding a task to q1 was throwing away and rebuilding every row
    // in q2, q3 and q4 as well. Cheap while the lists are short, and it is what
    // made an add cost 256ms once there were 400 rows in each.
    const key = rowsKey(items);
    if (drawn.get(q) !== key) {
      list.replaceChildren(...items.map((task, i) => itemEl(task, i)));
      drawn.set(q, key);
    }
    const count = $(`[data-count="${q}"]`);
    count.textContent = String(items.length);
    // A hint, not a limit — see isCrowded. Nothing here stops an add.
    const crowded = isCrowded(q, items.length);
    count.classList.toggle("crowded", crowded);
    count.title = crowded ? t("matrix.crowded") : "";
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
  $$(".add:not(.inbox-add)").forEach((form) => {
    const input = $<HTMLInputElement>('input[type="text"]', form);
    const chip = dueChip(null, () => {});
    addChips.push(chip);
    const submit = $('button[type="submit"]', form);
    // The markup leaves this empty; a drawn + centres itself where the glyph
    // would have needed a per-font nudge.
    submit.replaceChildren(plusIcon());
    form.insertBefore(chip, submit);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      addTask(form.dataset.add as Place, input.value, chip.input.value);
      input.value = "";
      chip.apply("");
      input.focus();
    });
  });
}
