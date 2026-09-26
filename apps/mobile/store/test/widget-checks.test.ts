/**
 * Completing what was checked in the home-screen widget.
 *
 * The widget cannot write to the board, so a check is a note -- id to the
 * moment it was pressed -- that the app turns into a completion when it next
 * comes to the front. Two things can lose data here and neither is visible:
 * a completion stamped with the tap time that the push never sends (it is
 * older than the watermark), and a stale check that undoes something another
 * device did after it. Both are pinned below.
 */

import { beforeEach, expect, test, vi } from "vitest";
import { unsentChanges } from "@nekan/shared/sync";
import type { Task } from "@nekan/shared/types";

vi.mock("../persist", () => ({
  load: async () => ({ tasks: [], settings: {} }),
  save: async () => {},
  storePath: () => "/nowhere/data.json",
  backup: () => "/nowhere/data.before-login.json",
}));

const { allTasks, findTask, now, saveSyncState, setTasks, syncState } =
  await import("../state");
const { completeFromWidget } = await import("../mutations");

function task(over: Partial<Task> = {}): Task {
  return {
    id: "t1",
    text: "할 일",
    quadrant: "q1",
    space: "work",
    dueDate: null,
    memo: "메모",
    orderKey: "V",
    createdAt: 1000,
    updatedAt: 1000,
    stateAt: 1000,
    completedAt: null,
    deletedAt: null,
    purgedAt: null,
    ...over,
  };
}

beforeEach(() => {
  saveSyncState({ cursor: 0, pushedAt: 0, account: "u1" });
});

test("a check completes the task as of the tap, not as of now", () => {
  setTasks([task()]);

  expect(completeFromWidget({ t1: 5000 })).toBe(1);

  const done = findTask("t1");
  expect(done?.completedAt).toBe(5000);
  // The state half carries the tap; the content half is untouched, so a title
  // edited elsewhere in between still wins its own half.
  expect(done?.stateAt).toBe(5000);
  expect(done?.updatedAt).toBe(1000);
});

test("a check older than the watermark is still sent", () => {
  setTasks([task()]);
  // The app synced after the tap: everything up to 9000 is marked sent.
  saveSyncState({ cursor: 7, pushedAt: 9000, account: "u1" });

  completeFromWidget({ t1: 5000 });

  const pending = unsentChanges(allTasks() as Task[], syncState().pushedAt);
  expect(pending.map((t) => t.id)).toEqual(["t1"]);
  // The cursor is not the push's business.
  expect(syncState().cursor).toBe(7);
});

test("a sync that read the watermark before the check cannot save it back", () => {
  setTasks([task()]);
  saveSyncState({ cursor: 7, pushedAt: 9000, account: "u1" });
  // What the loop holds while it is out on the network.
  const inFlight = syncState();

  completeFromWidget({ t1: 5000 });
  // It skipped t1 (it was pushing from 9000) and now saves where it got to.
  saveSyncState({ ...inFlight, pushedAt: 9500 });

  expect(syncState().pushedAt).toBeLessThan(5000);
  // Only once: the next run's own save is its own.
  saveSyncState({ ...syncState(), pushedAt: 9600 });
  expect(syncState().pushedAt).toBe(9600);
});

test("a check does not move a watermark that already lets it through", () => {
  setTasks([task()]);
  saveSyncState({ cursor: 0, pushedAt: 3000, account: "u1" });

  completeFromWidget({ t1: 5000 });

  expect(syncState().pushedAt).toBe(3000);
});

test("a change made after the tap wins over it", () => {
  // Restored on the desktop at 6000, after the widget's tap at 5000.
  setTasks([task({ stateAt: 6000 })]);

  expect(completeFromWidget({ t1: 5000 })).toBe(0);
  expect(findTask("t1")?.completedAt).toBe(null);
});

test("a task that is already finished, trashed or buried is left alone", () => {
  setTasks([
    task({ id: "done", completedAt: 2000, stateAt: 2000 }),
    task({ id: "trash", deletedAt: 2000, stateAt: 2000 }),
    // 0 is a real stamp: truthiness would read this grave as live.
    task({ id: "grave", purgedAt: 0, text: "", memo: null }),
  ]);

  expect(completeFromWidget({ done: 5000, trash: 5000, grave: 5000 })).toBe(0);
  expect(findTask("done")?.completedAt).toBe(2000);
  expect(findTask("trash")?.completedAt).toBe(null);
  expect(findTask("grave")?.completedAt).toBe(null);
});

test("a check for a task this phone does not have is dropped", () => {
  setTasks([task()]);

  expect(completeFromWidget({ gone: 5000 })).toBe(0);
});

test("a stamp that is not a time is dropped", () => {
  setTasks([task({ id: "a" }), task({ id: "b" }), task({ id: "c" })]);

  expect(completeFromWidget({ a: "soon", b: -1, c: null })).toBe(0);
});

test("a stamp from the future is brought back to now", () => {
  setTasks([task()]);
  const future = now() + 3_600_000;

  completeFromWidget({ t1: future });

  expect(findTask("t1")?.completedAt).toBeLessThanOrEqual(now());
});
