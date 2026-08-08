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

import { QUADS, isCrowded } from "../core-bridge.js";
import { $, $$, numEl } from "../dom.js";
import { dueChip } from "../components/due-chip.js";
import { memoMark } from "../components/memo-mark.js";
import {
  activeOf,
  addTask,
  completeTask,
  deleteTask,
  setDue,
} from "../store.js";
import { isSelected, wireRowSelection } from "./memo.js";
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
  check.title = "완료 (히스토리로 이동)";
  // Icon-only buttons: without this a screen reader announces "button".
  check.setAttribute("aria-label", `완료: ${task.text}`);
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
  text.title = "클릭하여 메모 · 더블클릭하여 수정";
  text.addEventListener("dblclick", () => startEdit(li, text, task));

  const due = dueChip(task.dueDate, (value) => setDue(task.id, value));

  const del = document.createElement("button");
  del.className = "del";
  del.textContent = "×";
  del.title = "삭제 (휴지통으로 이동)";
  del.setAttribute("aria-label", `삭제: ${task.text}`);
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
  items
    .map(
      (t) =>
        `${t.id}\u0000${t.text}\u0000${t.dueDate || ""}` +
        `\u0000${t.memo ? 1 : 0}\u0000${isSelected(t.id) ? 1 : 0}`,
    )
    .join("\u0001");

/** The last rowsKey drawn into each quadrant. */
const drawn = new Map();

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
    count.title = crowded
      ? "이 칸이 이렇게 차 있으면 우선순위가 없는 것과 같습니다. 2분면에 시간을 먼저 잡아 두세요."
      : "";
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
    const input = $('input[type="text"]', form);
    const chip = dueChip(null, () => {});
    form.insertBefore(chip, $('button[type="submit"]', form));

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      addTask(form.dataset.add, input.value, chip.input.value);
      input.value = "";
      chip.apply("");
      input.focus();
    });
  });
}
