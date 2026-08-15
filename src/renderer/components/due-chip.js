/**
 * The due-date chip in its two forms: editable on the matrix, read-only in the
 * history and trash lists.
 *
 * What a date *means* is not decided here. `dueInfo()` in shared/core.js counts
 * the days and names the state that colours the chip, and `formatDue()` turns
 * that into the two strings on screen — the same pair the export prints, so a
 * chip and a PDF can never word one date two ways.
 */

import { dueInfo, formatDue } from "../core-bridge.js";
import { currentLanguage, t } from "../i18n.js";
import { calendarIcon } from "./icons.js";

/** The words for a due date, in whatever language is on screen right now. */
const words = (info) => formatDue(info, t, currentLanguage());

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
  const box = document.createElement("span");
  const chip = document.createElement("span");
  chip.className = "due";

  const input = document.createElement("input");
  input.type = "date";

  const face = document.createElement("span");
  face.className = "face";
  chip.append(input, face);

  // No clear button of our own: the native picker this chip opens already has
  // one, and a second way to do the same thing was costing a control in every
  // row and in every add form.
  box.append(chip);
  box.draggable = false;

  /**
   * Repaint the face for `next`; an empty date falls back to the icon.
   *
   * The three fixed labels are rewritten here rather than once at construction,
   * which makes repainting and relabelling the same call. A row's chip is
   * rebuilt on every redraw so it would not have mattered there — but the chip
   * in an add form is built once by wireAddForms() and lives for the run, and
   * with the labels set above it kept saying "마감일 지정" in an English window.
   */
  const apply = (next) => {
    input.value = next || "";
    input.setAttribute("aria-label", t("due.field"));
    const info = dueInfo(next);
    box.className = info ? `duebox set ${info.state}` : "duebox";
    face.replaceChildren();
    if (info) {
      const { text, hint } = words(info);
      face.textContent = text;
      chip.title = t("due.chip", { date: text, hint });
    } else {
      face.append(calendarIcon());
      chip.title = t("due.set");
    }
  };

  // Clearing arrives here too: the picker's own delete empties the value and
  // fires the same change, which is why removing our button costs nothing.
  input.addEventListener("change", () => {
    apply(input.value);
    onChange(input.value || null);
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
  const { text, hint } = words(info);
  const box = document.createElement("span");
  box.className = `duebox set ${info.state} static`;
  const chip = document.createElement("span");
  chip.className = "due";
  chip.title = t("due.chip", { date: text, hint });
  const face = document.createElement("span");
  face.className = "face";
  face.textContent = text;
  chip.append(face);
  box.append(chip);
  return box;
}
