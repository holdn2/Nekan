/**
 * The phone's copy of the board, on disk.
 *
 * A JSON file rather than AsyncStorage, for two reasons. Android's default
 * AsyncStorage is capped around six megabytes and a long history would hit it
 * -- and the failure there is silent, which is the worst shape for the one
 * store the app has. And the desktop already keeps a `data.json` of exactly
 * this shape, so when sync arrives both ends are reading the same document
 * rather than translating between two.
 *
 * Writes go to a neighbour and are moved into place, the same rule as
 * `main/store-io.ts`: a write interrupted halfway must not be able to leave a
 * half-written board behind. A move is the only step that is atomic.
 */
import { Directory, File, Paths } from "expo-file-system";
import { normalizeTasks } from "@nekan/shared/core";
import type { Task } from "@nekan/shared/types";

/** What the file holds. Settings stay small and local -- sync carries tasks. */
export interface Stored {
  tasks: Task[];
  settings: Record<string, unknown>;
}

const EMPTY: Stored = { tasks: [], settings: {} };

/**
 * Fresh handles every time, never module-level ones.
 *
 * `move()` rewrites the URI of the object it is called on -- the docs say so
 * in one clause and it is easy to miss. A File kept in a constant therefore
 * stops meaning what its name says the moment it is moved once: the temporary
 * file became data.json after the first save, and the second save tried to
 * move data.json onto the file it had just deleted.
 */
function handles() {
  const dir = new Directory(Paths.document, "nekan");
  return {
    dir,
    file: new File(dir, "data.json"),
    temp: new File(dir, "data.json.tmp"),
  };
}

/**
 * Read the board, or start an empty one.
 *
 * A missing file is a first run. A file that will not parse is a corrupted
 * one, and the answer there is the same as the desktop's: hand back an empty
 * board rather than throwing, because a crash on launch leaves no way in.
 * Nothing is deleted -- the bad file stays where it is, so it can be looked at.
 */
export async function load(): Promise<Stored> {
  try {
    const { file, temp } = handles();
    // The neighbour is the board too, for one instant. `move` has no
    // overwrite, so the old file has to be deleted first, and a crash in that
    // gap would leave data.json missing and data.json.tmp complete. Reading
    // the neighbour when the file is gone is what makes the write atomic in
    // effect: a fully written board always exists under one of the two names.
    const source = file.exists ? file : temp.exists ? temp : null;
    if (!source) return EMPTY;
    const parsed = JSON.parse(await source.text()) as Partial<Stored>;
    return {
      tasks: normalizeTasks(parsed?.tasks),
      settings: (parsed?.settings as Record<string, unknown>) ?? {},
    };
  } catch {
    return EMPTY;
  }
}

/**
 * Write the board. Neighbour first, then move -- never in place.
 *
 * The delete is unavoidable: `move` refuses an existing destination. What
 * makes the gap survivable is `load` reading the neighbour when the file is
 * missing, not the ordering here.
 */
export async function save(state: Stored): Promise<void> {
  const { dir, file, temp } = handles();
  dir.create({ intermediates: true, idempotent: true });
  temp.create({ overwrite: true });
  temp.write(JSON.stringify(state));
  if (file.exists) file.delete();
  temp.move(file);
}

/** Where the file is, for the settings screen to show and for diagnosis. */
export const storePath = () => handles().file.uri;
