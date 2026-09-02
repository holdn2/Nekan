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
import type { PublicSession, Space, Task } from "@nekan/shared/types";
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
let started = false;
export async function init(): Promise<void> {
  if (started) return;
  started = true;
  const stored = await load();
  // Anything written while the read was in flight keeps its place. The screens
  // wait on `isReady`, so this should be empty -- but assigning over it would
  // drop a task without saying so, and that is the one failure this store is
  // not allowed to have.
  const early = tasks;
  tasks = early.length ? [...stored.tasks, ...early] : stored.tasks;
  settings = stored.settings;
  activeSpace = sanitizeSpace(settings.space);
  ready = true;
  notify();
  if (early.length) void persist();
}

export const isReady = () => ready;

/** Every list goes through this. A board is a filter, not a second array. */
export const inSpace = (t: Task) => t.space === null || t.space === activeSpace;

export const currentSpace = () => activeSpace;

/** Read-only view of the array, for selectors in this folder only. */
export const allTasks = (): readonly Task[] => tasks;

/**
 * The two settings the person picks rather than the board decides.
 *
 * Both are per-device and neither travels: the desktop keeps `settings.theme`
 * and `settings.language` out of sync for the same reason, which is that a
 * laptop in a bright room and a phone in bed are not obliged to agree.
 *
 * `null` means "whatever the device says". That is the honest third state --
 * not a default that was chosen, but the absence of a choice, which is what
 * a fresh install has and what "follow the system" goes on meaning after the
 * system changes its mind.
 */
/**
 * Ask every screen to draw again for something that is not a task.
 *
 * The language is the one such thing so far: it lives in i18next rather than
 * here, but the screens subscribed to this store are the ones with words on
 * them, so this is where "everything changed" gets said.
 */
export const redraw = (): void => notify();

/**
 * Who is signed in, as much of it as a screen may know.
 *
 * Not persisted here and not part of `Stored`: the session itself lives in
 * the keychain, and this is the shadow of it that screens are allowed to see.
 * `shared/auth`'s `publicSession()` decides what that is by *picking* fields
 * rather than deleting them, so a field added to Session later cannot leak by
 * being forgotten.
 */
let auth: PublicSession | null = null;

export const currentAuth = (): PublicSession | null => auth;

export function setAuth(next: PublicSession | null): void {
  auth = next;
  notify();
}

export type ThemeChoice = "light" | "dark" | null;

const asTheme = (v: unknown): ThemeChoice =>
  v === "light" || v === "dark" ? v : null;

export const themeChoice = (): ThemeChoice => asTheme(settings.theme);

export function setThemeChoice(choice: ThemeChoice): void {
  if (asTheme(settings.theme) === choice) return;
  settings = { ...settings, theme: choice };
  notify();
  void persist();
}

/** `null` means the device's language, the same way as the theme above. */
export const languageChoice = (): string | null =>
  typeof settings.language === "string" ? settings.language : null;

export function setLanguageChoice(lang: string | null): void {
  if (languageChoice() === lang) return;
  settings = { ...settings, language: lang };
  notify();
  void persist();
}

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

/**
 * One write at a time, and the last one wins -- writes are not queued.
 *
 * Two rules hold it together. Nothing is written before `init` has read the
 * file, or a mutation racing start-up saves an empty board over the real one.
 * And a failed write must not poison the chain: a rejected promise left in
 * `writing` is what every later write chains off, so one failure used to stop
 * saving for the rest of the session -- silently, since the callers void it.
 * The failure is reported and the chain carries on.
 */
let writing: Promise<void> = Promise.resolve();
export function persist(): Promise<void> {
  if (!ready) return writing;
  const snapshot: Stored = { tasks, settings };
  writing = writing.then(() =>
    save(snapshot).catch((err: unknown) => {
      console.warn("[nekan] could not save the board", err);
    }),
  );
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
