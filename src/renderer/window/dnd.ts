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

import { isPlace } from "../../shared/core.js";
import { $, $$, target } from "../dom.js";
import { moveTask } from "../store.js";

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

/** Bind the drag handlers. Called once; the zones outlive every render. */
export function wireDragAndDrop() {
  let draggingId = null;

  document.addEventListener("dragstart", (e) => {
    const item = target(e).closest?.(".item") as HTMLElement | null;
    if (!item) return;
    draggingId = item.dataset.id;
    item.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", draggingId);
  });

  document.addEventListener("dragend", (e) => {
    target(e).closest?.(".item")?.classList.remove("dragging");
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
      if (!zone.contains(e.relatedTarget as Node))
        zone.classList.remove("drop");
    });

    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("drop");
      const id = draggingId || e.dataTransfer.getData("text/plain");
      if (!id) return;
      const before = afterElement(list, e.clientY);
      // The drop zone names its quadrant in the markup, so this is only ever
      // one of the five -- but it arrives as whatever the DOM has, and writing
      // an unknown one into a task would take that task off the screen.
      const quad = zone.dataset.quad;
      if (!isPlace(quad)) return;
      moveTask(id, quad, before?.dataset.id ?? null);
    });
  });
}
