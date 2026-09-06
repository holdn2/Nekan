/**
 * What signing in does to the tasks already on this device.
 *
 * The phone used to send them all up without asking, so signing in on
 * somebody else's phone copied their list into your account. The answer is a
 * question at sign-in -- and the half of it worth testing is the one that
 * takes tasks off the screen, because that is the half that can lose them.
 */

import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Task } from "@nekan/shared/types";

const backup = vi.fn();
vi.mock("../persist", () => ({
  load: async () => ({ tasks: [], settings: {} }),
  save: async () => {},
  storePath: () => "/nowhere/data.json",
  backup: (...args: unknown[]) => backup(...args),
}));

const { adoptLocalTasks, allTasks, setTasks } = await import("../state");

function task(over: Partial<Task> = {}): Task {
  return {
    id: "t1",
    text: "할 일",
    quadrant: "q1",
    space: "work",
    dueDate: null,
    memo: null,
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
  backup.mockReset().mockReturnValue("/nowhere/data.before-login.json");
  setTasks([task({ id: "a" }), task({ id: "b" })]);
});

describe("adoptLocalTasks", () => {
  test("merging leaves the board alone and copies nothing aside", () => {
    adoptLocalTasks("merge");

    expect(allTasks()).toHaveLength(2);
    expect(backup).not.toHaveBeenCalled();
  });

  test("replacing copies the board aside before clearing it", () => {
    adoptLocalTasks("replace");

    expect(backup).toHaveBeenCalledTimes(1);
    // What went aside is the board as it was, not what is left after.
    const saved = backup.mock.calls[0][0] as { tasks: Task[] };
    expect(saved.tasks.map((t) => t.id)).toEqual(["a", "b"]);
    expect(allTasks()).toHaveLength(0);
  });

  test("a failed copy keeps the tasks rather than clearing them", () => {
    // The one that matters. Being asked to leave tasks out of an account is
    // not being asked to destroy them, and a write can fail on a full disk --
    // clearing anyway would destroy the very list the copy exists to keep.
    backup.mockReturnValue(null);

    adoptLocalTasks("replace");

    expect(allTasks()).toHaveLength(2);
  });

  test("an unknown mode is treated as merge, not as replace", () => {
    // Whatever a caller passes, the destructive branch is the one that has to
    // be asked for by name.
    adoptLocalTasks("");
    adoptLocalTasks("REPLACE");

    expect(allTasks()).toHaveLength(2);
    expect(backup).not.toHaveBeenCalled();
  });
});
