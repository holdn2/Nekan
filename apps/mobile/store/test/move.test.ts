/**
 * Moving a task between the quadrants and the dump.
 *
 * The rule being pinned is the one that loses tasks when it breaks: the dump
 * is shared by both boards, and that sharing *is* `space === null`. A task
 * carried into the dump with its board still on it shows up on one side only;
 * a task carried out of the dump without a board shows up on both. Neither
 * fails loudly -- the row is there, just not where somebody is looking.
 *
 * The detail screen's move chips call these directly, and they are the only
 * way to do it without dragging, so this is also the only coverage that path
 * has: the phone's gestures are not exercised by any test.
 */

import { beforeEach, expect, test, vi } from "vitest";
import { INBOX } from "@nekan/shared/core";
import type { Task } from "@nekan/shared/types";

vi.mock("../persist", () => ({
  load: async () => ({ tasks: [], settings: {} }),
  save: async () => {},
  storePath: () => "/nowhere/data.json",
  backup: () => "/nowhere/data.before-login.json",
}));

const { findTask, setTasks, setSpace } = await import("../state");
const { moveToTop, unfileTask } = await import("../mutations");

function task(over: Partial<Task> = {}): Task {
  return {
    id: "t1",
    text: "할 일",
    quadrant: "q1",
    space: "work",
    dueDate: "2026-09-30",
    memo: "메모",
    orderKey: "V",
    createdAt: 1,
    updatedAt: 1,
    stateAt: 1,
    completedAt: null,
    deletedAt: null,
    purgedAt: null,
    ...over,
  };
}

beforeEach(() => {
  setSpace("work");
});

test("a task sent to the dump loses its board", () => {
  setTasks([task()]);

  unfileTask("t1");

  const moved = findTask("t1");
  expect(moved?.quadrant).toBe(INBOX);
  // The whole point of the dump: null is what makes both boards show it.
  expect(moved?.space).toBe(null);
});

test("a task leaving the dump joins the board being looked at", () => {
  setTasks([task({ quadrant: INBOX, space: null })]);
  setSpace("life");

  moveToTop("t1", "q3");

  const moved = findTask("t1");
  expect(moved?.quadrant).toBe("q3");
  expect(moved?.space).toBe("life");
});

test("what is not a board survives the trip", () => {
  // Dragging has always left these alone -- the dump hides a due date rather
  // than dropping it -- and the chips are the same move, so they must too.
  setTasks([task()]);

  unfileTask("t1");
  moveToTop("t1", "q2");

  const moved = findTask("t1");
  expect(moved?.dueDate).toBe("2026-09-30");
  expect(moved?.memo).toBe("메모");
  expect(moved?.text).toBe("할 일");
});

test("a move counts as a content change, not a state change", () => {
  // Which stamp moves decides who wins a merge. A quadrant is content, so
  // `updatedAt` is the one that must move; `stateAt` is for done and deleted.
  setTasks([task({ updatedAt: 1, stateAt: 5 })]);

  unfileTask("t1");

  const moved = findTask("t1");
  expect(moved?.updatedAt).toBeGreaterThan(1);
  expect(moved?.stateAt).toBe(5);
});
