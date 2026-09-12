/**
 * What the loop forgets, and when.
 *
 * The cursor is an optimisation with one dangerous property: it is a claim
 * about what this device already holds. Every place that stops holding it --
 * signing out, replacing the board with the account's copy -- has to say so,
 * or the next pull asks for changes since a moment that no longer means
 * anything and comes back with almost nothing. Nothing errors. The board is
 * simply missing rows, which reads as having lost them.
 *
 * `useAccount` catches the case people think of first, a different account. It
 * cannot catch these two: signing back into the same account is not an account
 * change.
 */

import { beforeEach, expect, test, vi } from "vitest";

/** The one module below the store that would need a device. */
vi.mock("../../store/persist", () => ({
  load: async () => ({ tasks: [], settings: {} }),
  save: async () => {},
  backup: () => true,
  storePath: () => "/nowhere/data.json",
}));

/** The loop listens for the app coming to the front; nothing here does that. */
vi.mock("react-native", () => ({
  AppState: { addEventListener: () => ({ remove() {} }) },
}));

// The two modules that reach the device or the network. Mocked to keep the
// import out of expo-secure-store, not because this test exercises them --
// nothing here runs a sync, it only asks what the loop forgot.
vi.mock("../../api/session", () => ({
  accessToken: async () => null,
  currentSession: () => null,
  sessionEpoch: () => 0,
}));
vi.mock("../transfer", () => ({
  pull: async () => ({ ok: false, cursor: 0, overwritten: 0 }),
  push: async () => ({ ok: false, pushedAt: 0 }),
}));

const { stopSync } = await import("../loop");
const { adoptLocalTasks, saveSyncState, syncState, setTasks } =
  await import("../../store/state");

beforeEach(() => {
  saveSyncState({ cursor: 4321, pushedAt: 99, account: "u1" });
});

test("signing out forgets where the pull had got to", () => {
  stopSync();

  expect(syncState().cursor).toBe(0);
  expect(syncState().account).toBe(null);
});

test("replacing the board forgets it too", () => {
  // The board is emptied for the person who asked to keep only what the
  // account has. A cursor left pointing past every one of those rows means
  // none of them come back.
  setTasks([
    {
      id: "t1",
      text: "이 기기의 할 일",
      quadrant: "q1",
      space: "work",
      dueDate: null,
      memo: null,
      orderKey: "V",
      createdAt: 1,
      updatedAt: 1,
      stateAt: 1,
      completedAt: null,
      deletedAt: null,
      purgedAt: null,
    },
  ]);

  adoptLocalTasks("replace");

  expect(syncState().cursor).toBe(0);
});

test("merging keeps it, because the board still holds those rows", () => {
  adoptLocalTasks("merge");

  expect(syncState().cursor).toBe(4321);
});
