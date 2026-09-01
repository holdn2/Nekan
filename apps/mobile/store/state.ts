/**
 * What the screens read.
 *
 * The same shape as the renderer's store and for the same reason: the views
 * must not own the array. One module holds it, hands out lists, and tells
 * whoever is drawing that something changed. Here the telling is
 * `useSyncExternalStore` instead of a render bus, but the direction is
 * identical -- nothing above this file is imported by it.
 *
 * The array itself does not leave: `tasks` is not exported. A screen that
 * could hold the array could sort it, and position in that array means
 * nothing -- `orderKey` does.
 */
import { normalizeTasks, sanitizeSpace } from "@nekan/shared/core";
import type { Space, Task } from "@nekan/shared/types";
import { load, save, type Stored } from "./persist";

let tasks: Task[] = [];
let settings: Record<string, unknown> = {};
let activeSpace: Space = "work";
let ready = false;

/** Bumped on every change. What useSyncExternalStore compares. */
let version = 0;
const listeners = new Set<() => void>();

export const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

/** The snapshot is a number: the lists are rebuilt per read and never equal. */
export const getVersion = () => version;

function notify() {
  version += 1;
  for (const fn of listeners) fn();
}

/**
 * Read the file once, at start-up.
 *
 * Nothing renders real rows before this resolves, so the screens have to cope
 * with an empty board for a frame. That is the honest state -- inventing rows
 * to fill the gap would show a board that is not the user's.
 */
export async function init(): Promise<void> {
  const stored = await load();
  tasks = stored.tasks;
  settings = stored.settings;
  activeSpace = sanitizeSpace(settings.space);
  ready = true;
  notify();
}

export const isReady = () => ready;

/** Every list goes through this. A board is a filter, not a second array. */
export const inSpace = (t: Task) => t.space === null || t.space === activeSpace;

export const currentSpace = () => activeSpace;

/** Read-only view of the array, for selectors in this folder only. */
export const allTasks = (): readonly Task[] => tasks;

export function setSpace(space: Space): void {
  if (space === activeSpace) return;
  activeSpace = space;
  settings = { ...settings, space };
  notify();
  void persist();
}

/**
 * Replace the board wholesale. Sync's entry point later; for now the seed's.
 *
 * Normalises rather than trusting the caller: a field added to Task since the
 * file was written is absent, and a row read as `undefined` disappears from
 * the screen without saying so.
 */
export function setTasks(next: unknown): void {
  tasks = normalizeTasks(next);
  notify();
  void persist();
}

/** One write at a time, and the last one wins -- writes are not queued. */
let writing: Promise<void> | null = null;
export function persist(): Promise<void> {
  const snapshot: Stored = { tasks, settings };
  writing = (writing ?? Promise.resolve()).then(() => save(snapshot));
  return writing;
}

/**
 * How far this device's clock is from the server's.
 *
 * Zero until sync measures it, and that is the only reason this file can be
 * written before sync exists: every timestamp already goes through `now()`, so
 * the day the offset becomes real, nothing else has to change.
 *
 * It matters more than it looks. `updatedAt` decides who wins when two devices
 * edited the same row, so a phone whose clock is ten minutes slow loses every
 * one of its edits -- silently, because losing looks exactly like never having
 * typed it.
 */
let clockOffset = 0;

export function setClockOffset(ms: number): void {
  clockOffset = Number.isFinite(ms) ? ms : 0;
}

/** Never Date.now() directly. See above. */
export const now = (): number => Date.now() + clockOffset;

/** Ids are compared for equality, never for order -- Date.now() is fine here. */
export const uid = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const findTask = (id: string): Task | undefined =>
  tasks.find((t) => t.id === id);

/** Stamp a row as edited. The stamp is what sync compares. */
export function touch(task: Task): void {
  task.updatedAt = now();
}

/** Rows are pushed, never spliced -- a task leaves a board by timestamp. */
export function insertTask(task: Task): void {
  tasks.push(task);
}

/** Save and redraw. Every mutation ends here so neither can be forgotten. */
export function commit(...touched: Task[]): void {
  for (const task of touched) touch(task);
  notify();
  void persist();
}
