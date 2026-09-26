/**
 * What the widget is handed.
 *
 * The widget cannot check any of this for itself -- it has no store, no
 * catalogue and no notion of which rows are live -- so whatever this file lets
 * through is what the home screen shows. The rules pinned here are the ones
 * that would otherwise put a finished task, a trashed one, or the other board's
 * rows on somebody's home screen, silently and until the app is next opened.
 */

import { expect, test } from "vitest";
import { PALETTE } from "@nekan/shared/theme";
import type { Task } from "@nekan/shared/types";
import { FEED_ROWS, FEED_VERSION, WIDGET_ROLES, buildFeed } from "../feed";

function task(over: Partial<Task> = {}): Task {
  return {
    id: "t",
    text: "할 일",
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
    ...over,
  };
}

/** Echoes the key, so a test can tell which string was asked for. */
const t = (key: string) => `<${key}>`;

const build = (tasks: Task[]) =>
  buildFeed(tasks, {
    space: "work",
    lang: "ko",
    t,
    now: new Date(2026, 8, 24),
    stamp: 123,
  });

test("carries only what is live on the board", () => {
  const feed = build([
    task({ id: "live" }),
    task({ id: "done", completedAt: 5 }),
    task({ id: "trash", deletedAt: 5 }),
    // A zero stamp is a real one. Truthiness would read it as "never" and put
    // a buried row -- with its text already emptied -- on the home screen.
    task({ id: "buried", purgedAt: 0 }),
  ]);

  expect(feed.boards.work.q1.rows.map((r) => r.id)).toEqual(["live"]);
  expect(feed.boards.work.q1.count).toBe(1);
});

test("keeps the two boards apart and leaves the dump out", () => {
  const feed = build([
    task({ id: "w", space: "work" }),
    task({ id: "l", space: "life" }),
    // Shared by both boards and belonging to neither; the widget shows
    // quadrants only.
    task({ id: "d", quadrant: "inbox", space: null }),
  ]);

  expect(feed.boards.work.q1.rows.map((r) => r.id)).toEqual(["w"]);
  expect(feed.boards.life.q1.rows.map((r) => r.id)).toEqual(["l"]);
  const all = Object.values(feed.boards).flatMap((b) =>
    Object.values(b).flatMap((q) => q.rows.map((r) => r.id)),
  );
  expect(all).not.toContain("d");
});

test("orders by orderKey, not by where a row sits in the array", () => {
  const feed = build([
    task({ id: "second", orderKey: "b" }),
    task({ id: "first", orderKey: "a" }),
  ]);

  expect(feed.boards.work.q1.rows.map((r) => r.id)).toEqual([
    "first",
    "second",
  ]);
});

test("caps the rows but not the count", () => {
  const many = Array.from({ length: FEED_ROWS + 5 }, (_, i) =>
    task({ id: `t${i}`, orderKey: String(i).padStart(3, "0") }),
  );
  const q1 = build(many).boards.work.q1;

  expect(q1.rows).toHaveLength(FEED_ROWS);
  // The title line says how long the list really is.
  expect(q1.count).toBe(FEED_ROWS + 5);
});

test("sends the due date twice: once to compare, once to read", () => {
  const row = build([task({ dueDate: "2026-09-23" })]).boards.work.q1.rows[0];

  // The widget works out overdue against its own clock, because the snapshot
  // can be read a day after it was written.
  expect(row.due).toBe("2026-09-23");
  // The words are the app's, fixed at writing -- the same chip the row shows.
  expect(row.dueText).toMatch(/^9\/23\(/);
});

test("a task with no due date sends none", () => {
  const row = build([task()]).boards.work.q1.rows[0];
  expect(row.due).toBeNull();
  expect(row.dueText).toBeNull();
});

test("the words come from the app's catalogue, not the widget's", () => {
  const feed = build([]);

  expect(feed.labels.quads.q1).toBe("<quad.q1.action>");
  expect(feed.labels.spaces).toEqual({
    work: "<space.work>",
    life: "<space.life>",
  });
  // The history screen's words for the same act, rather than new ones.
  expect(feed.labels.previous).toBe("<archive.pagePrev>");
  expect(feed.labels.next).toBe("<archive.pageNext>");
  expect(feed.lang).toBe("ko");
});

test("the quadrant colours are the palette's, both themes", () => {
  const feed = build([]);
  expect(feed.colors.light.q2).toBe(PALETTE.light.q2);
  expect(feed.colors.dark.q4).toBe(PALETTE.dark.q4);
});

test("every quadrant of both boards is present, even when empty", () => {
  const feed = build([]);
  // The widget indexes straight into these; a missing key is a crash there,
  // not an empty list.
  for (const board of ["work", "life"] as const)
    for (const q of ["q1", "q2", "q3", "q4"] as const)
      expect(feed.boards[board][q]).toEqual({ count: 0, rows: [] });
  expect(feed.v).toBe(FEED_VERSION);
  expect(feed.space).toBe("work");
});

test("carries the app's clock offset, for the widget's checks", () => {
  const phone = new Date(2026, 8, 24, 9, 0, 0);
  const feed = buildFeed([], {
    space: "work",
    lang: "ko",
    t,
    now: phone,
    // The app's clock runs ten minutes ahead of the phone's.
    stamp: phone.getTime() + 600_000,
  });

  expect(feed.offset).toBe(600_000);
});

test("each row's circle is named in the app's words", () => {
  const feed = build([task({ id: "a", text: "우유 사기" })]);

  expect(feed.boards.work.q1.rows[0].doneLabel).toBe("<item.completeLabel>");
  expect(feed.labels.undo).toBe("<archive.restore>");
  // The one way into the app, named in the app's words.
  expect(feed.labels.openInApp).toBe("<widget.openInApp>");
});

test("every colour the widget draws with is sent, in a shape Swift can read", () => {
  const feed = build([]);
  for (const theme of ["light", "dark"] as const) {
    for (const role of WIDGET_ROLES) {
      // Color(hex:) in BoardWidget.swift takes #rrggbb and nothing else; a
      // role with alpha would silently draw as the fallback grey.
      expect(feed.colors[theme][role], `${theme}.${role}`).toMatch(
        /^#[0-9a-f]{6}$/i,
      );
      expect(feed.colors[theme][role]).toBe(PALETTE[theme][role]);
    }
  }
});

test("carries the app's theme choice, or null to follow the phone", () => {
  expect(build([]).theme).toBe(null);
  const dark = buildFeed([], {
    space: "work",
    lang: "ko",
    t,
    now: new Date(2026, 8, 24),
    stamp: 123,
    theme: "dark",
  });
  expect(dark.theme).toBe("dark");
});
