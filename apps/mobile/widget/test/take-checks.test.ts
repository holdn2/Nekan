/**
 * Taking the widget's checks into the board.
 *
 * The widget's record is the only other copy of a check until the board is on
 * disk, so it may be removed only after a write that succeeded. The app's
 * saves swallow their failures -- a failed write still resolves -- which is
 * why this asks `persistChecked()` rather than awaiting `persist()`.
 */

import { beforeEach, expect, test, vi } from "vitest";
import type { Task } from "@nekan/shared/types";

const saved = vi.hoisted(() => ({ fail: false, writes: 0 }));
const shared = vi.hoisted(() => new Map<string, string>());

vi.mock("../../store/persist", () => ({
  load: async () => ({ tasks: [], settings: {} }),
  save: async () => {
    saved.writes += 1;
    if (saved.fail) throw new Error("disk full");
  },
  storePath: () => "/nowhere/data.json",
  backup: () => "/nowhere/data.before-login.json",
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  AppState: { addEventListener: () => ({ remove() {} }) },
}));
vi.mock("@bacons/apple-targets", () => ({
  ExtensionStorage: class {
    static reloadWidget() {}
    get(key: string) {
      return shared.get(key) ?? null;
    }
    set(key: string, value: string) {
      shared.set(key, value);
    }
    remove(key: string) {
      shared.delete(key);
    }
  },
}));
vi.mock("../../i18n", () => ({ locale: () => "ko", t: (k: string) => k }));

const { findTask, init, setTasks } = await import("../../store/state");
const { DONE_KEY, takeWidgetChecks } = await import("../publish");

function task(): Task {
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
  };
}

beforeEach(async () => {
  await init();
  setTasks([task()]);
  shared.clear();
  saved.fail = false;
  saved.writes = 0;
});

test("the record is removed once the board is written", async () => {
  shared.set(DONE_KEY, JSON.stringify({ t1: 5000 }));

  await takeWidgetChecks();

  expect(findTask("t1")?.completedAt).toBe(5000);
  expect(shared.has(DONE_KEY)).toBe(false);
});

test("a failed write keeps the record, and the next try finishes the job", async () => {
  shared.set(DONE_KEY, JSON.stringify({ t1: 5000 }));
  saved.fail = true;

  await takeWidgetChecks();

  // Completed in memory, but not on disk: the record is still the proof.
  expect(findTask("t1")?.completedAt).toBe(5000);
  expect(shared.has(DONE_KEY)).toBe(true);

  // Next time the app comes forward. Nothing new to complete -- it already
  // is -- but the board is written, and only then is the record let go.
  saved.fail = false;
  const before = saved.writes;
  await takeWidgetChecks();

  expect(saved.writes).toBeGreaterThan(before);
  expect(shared.has(DONE_KEY)).toBe(false);
});
