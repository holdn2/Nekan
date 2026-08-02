/**
 * Dragging a task from one list to another.
 *
 * The five drop zones are the four quadrants and the inbox — the same set as
 * `PLACES` — and a drop is the only place a task changes board: dragging out of
 * the shared inbox into a quadrant is what gives it a `space`. That rule lives
 * in store.moveTask(), so all this file decides is *where* the row landed.
 *
 * The handlers are bound once at startup, on the zones (which never change) and
 * on document (for the rows, which are rebuilt on every render).
 */

import { $, $$ } from '../dom.js';
import { moveTask } from '../store.js';

/** The row the dragged one should be inserted before, or undefined for last. */
function afterElement(list, y) {
  const items = $$(".item:not(.dragging)", list);
  return items.find((el) => {
    const box = el.getBoundingClientRect();
    return y < box.top + box.height / 2;
  });
}

/** Every place a task can be dropped: the four quadrants plus the inbox. */
const dropZones = () => [...$$(".quad"), $("#inboxPanel")];

export function wireDragAndDrop() {
  let draggingId = null;

  document.addEventListener("dragstart", (e) => {
    const item = e.target.closest?.(".item");
    if (!item) return;
    draggingId = item.dataset.id;
    item.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", draggingId);
  });

  document.addEventListener("dragend", (e) => {
    e.target.closest?.(".item")?.classList.remove("dragging");
    dropZones().forEach((z) => z.classList.remove("drop"));
    draggingId = null;
  });

  dropZones().forEach((zone) => {
    // The inbox zone is the whole section, header included, so a task can be
    // sent back up while the list is folded. afterElement then measures hidden
    // rows as zero-height and finds no insertion point, which lands the task at
    // the end — the right answer for a drop on a collapsed header.
    const list = $(".list, .inbox-list", zone);

    zone.addEventListener("dragover", (e) => {
      if (!draggingId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      zone.classList.add("drop");
    });

    zone.addEventListener("dragleave", (e) => {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove("drop");
    });

    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("drop");
      const id = draggingId || e.dataTransfer.getData("text/plain");
      if (!id) return;
      const before = afterElement(list, e.clientY);
      moveTask(id, zone.dataset.quad, before ? before.dataset.id : null);
    });
  });
}
