/**
 * What an edit answers.
 *
 * The detail screen says "saved" on this answer rather than on having called,
 * so a call that changes nothing has to say so -- text typed and then typed
 * back, or a title with a space added, reaches the store and writes nothing.
 */

import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Task } from "@nekan/shared/types";

vi.mock("../persist", () => ({
  load: async () => ({ tasks: [], settings: {} }),
  save: async () => {},
  storePath: () => "/nowhere/data.json",
  backup: () => "/nowhere/data.before-login.json",
}));

const { findTask, setTasks } = await import("../state");
const { editTask, setMemo } = await import("../mutations");

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
  setTasks([task()]);
});

describe("editTask", () => {
  test("answers true when the title changes", () => {
    expect(editTask("t1", "새 제목")).toBe(true);
    expect(findTask("t1")?.text).toBe("새 제목");
  });

  test("answers false for the title it already has, spaces and all", () => {
    expect(editTask("t1", "할 일")).toBe(false);
    // Trimmed on the way in, so a trailing space is the same title.
    expect(editTask("t1", "할 일 ")).toBe(false);
    expect(findTask("t1")?.updatedAt).toBe(1000);
  });
});

describe("setMemo", () => {
  test("answers true when the note changes", () => {
    expect(setMemo("t1", "고친 메모")).toBe(true);
    expect(findTask("t1")?.memo).toBe("고친 메모");
  });

  test("answers false for the note it already has", () => {
    expect(setMemo("t1", "메모")).toBe(false);
    expect(findTask("t1")?.updatedAt).toBe(1000);
  });
});
