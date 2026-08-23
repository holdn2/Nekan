/**
 * The array every other file in here reads, and the three ways it is written.
 *
 * A task is never removed from it. Completed, trashed and purged are all
 * timestamps, which is what makes main's merge on save safe: there is no such
 * thing as a save that legitimately has a row missing.
 *
 * `now()` rather than Date.now(). updatedAt is what decides who wins when the
 * same task was edited on two machines, so a clock ten minutes slow loses
 * every edit it makes; main measures the offset off a response header and
 * hands it here.
 */

import type { Task } from "../../shared/types.js";
import { DEFAULT_SPACE, sanitizeSpace } from "../../shared/core.js";
import { notify } from "../render-bus.js";

/** The whole renderer state that survives a restart. */
let tasks: Task[] = [];
/** Which matrix the header toggle is on. Not a task field — a filter. */
let activeSpace = DEFAULT_SPACE;
/** Server time minus this machine's, measured by main from a response header. */
let clockOffset = 0;

/**
 * Every timestamp this file writes, on the server's clock rather than this
 * machine's.
 *
 * `updatedAt` decides who wins when the same task was edited on two devices, so
 * a laptop ten minutes slow would lose all of those and a phone ten minutes
 * fast would win all of them — quietly, and every time. The offset is zero
 * until main has spoken to the server, which is also the right answer for an
 * app that never signs in.
 */
const now = () => Date.now() + clockOffset;

/** Main learned a new offset. Applies to the next write, never to old rows. */
export function setClockOffset(ms: number) {
  clockOffset = Number.isFinite(ms) ? ms : 0;
}

/**
 * Mark the rows a mutation changed.
 *
 * A mutation that forgets to stamp `updatedAt` silently loses that edit on
 * another device. Every write goes through persist(), which is why the stamping
 * lives here rather than in each of the twenty callers.
 */
function touch(rows: (Task | Task[])[]) {
  const at = now();
  rows.flat().forEach((task) => {
    if (task) task.updatedAt = at;
  });
}

/** Persist without redrawing — for edits whose caller renders itself. */
function persist(...touched: (Task | Task[])[]) {
  touch(touched);
  window.api.save(tasks);
}

/**
 * Persist and tell the app to redraw. Every mutation below ends here, which is
 * why no view has to remember to save: reaching the store *is* saving.
 */
function commit(...touched: (Task | Task[])[]) {
  persist(...touched);
  notify();
}

/** Random enough for a local file; no coordination needed. */
const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ------------------------------------------------------------------- load */

/** Seed the store from the snapshot main.js sent at startup. */
export function setTasks(list: Task[]) {
  tasks = list;
}

/**
 * Take the list a sync just merged.
 *
 * Deliberately not commit(): main has the same list already and wrote it, so
 * saving here would send it straight back — and the save would schedule another
 * sync, which would answer with another list. Redraw only.
 */
export function acceptSynced(list: Task[]) {
  if (!Array.isArray(list)) return;
  tasks = list;
  notify();
}

/**
 * How many tasks this machine is holding, both boards and every tab.
 *
 * Not filtered by `inSpace`: the question it answers is "what would go up if I
 * signed in", and that is all of them regardless of which board is on screen.
 * Tombstones are not tasks any more, so they do not count.
 */
export const activeCount = () => tasks.filter((t) => !t.purgedAt).length;

/** The task with this id, in whatever state — or undefined. */
export const findTask = (id: string) => tasks.find((t) => t.id === id);

/* ------------------------------------------------------------------ space */

export const getSpace = () => activeSpace;

/**
 * Switch boards. Only a filter changes — no task moves and nothing is written,
 * so the caller persists the *choice* through settings, not through the tasks.
 */
export function setSpace(next: unknown) {
  activeSpace = sanitizeSpace(next);
  return activeSpace;
}

/**
 * Is this task on the matrix currently on screen? A `space` of null means the
 * shared inbox, so those rows pass on both boards — every other list belongs to
 * one board alone.
 */
export const inSpace = (t: Task) => t.space === null || t.space === activeSpace;

/**
 * The live array, for the rest of store/ only.
 *
 * Not on the barrel: everything outside gets a filtered copy from a selector,
 * so nothing outside can append a row without going through the rules here.
 */
const allTasks = () => tasks;

export { allTasks, now, uid, touch, persist, commit };
