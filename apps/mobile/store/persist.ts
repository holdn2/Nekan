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

const DIR = new Directory(Paths.document, "nekan");
const FILE = new File(DIR, "data.json");
const TEMP = new File(DIR, "data.json.tmp");

const EMPTY: Stored = { tasks: [], settings: {} };

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
    if (!FILE.exists) return EMPTY;
    const parsed = JSON.parse(await FILE.text()) as Partial<Stored>;
    return {
      tasks: normalizeTasks(parsed?.tasks),
      settings: (parsed?.settings as Record<string, unknown>) ?? {},
    };
  } catch {
    return EMPTY;
  }
}

/** Write the board. Neighbour first, then move -- never in place. */
export async function save(state: Stored): Promise<void> {
  if (!DIR.exists) DIR.create({ intermediates: true });
  if (TEMP.exists) TEMP.delete();
  TEMP.create();
  TEMP.write(JSON.stringify(state));
  if (FILE.exists) FILE.delete();
  TEMP.move(FILE);
}

/** Where the file is, for the settings screen to show and for diagnosis. */
export const storePath = () => FILE.uri;
