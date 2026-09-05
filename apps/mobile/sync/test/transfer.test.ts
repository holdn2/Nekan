/**
 * The two directions, and the ways they can lose something.
 *
 * `shared/sync` decides which copy of a row wins and what still has to go up,
 * and `node --test` covers that already. What is left in `transfer.ts` is the
 * HTTP and the paging -- and that is where this app can lose data, because
 * every failure here is partial by nature: a pull that stops after three pages
 * of ten, a push that sent half a list. Each test below is one of those halves.
 *
 * The phone's store is the real one. Only `store/persist` is mocked, because
 * it is the single module underneath that reaches the device; the merge, the
 * normalizing and the watermark are the code that ships.
 */

import { beforeEach, describe, expect, test, vi } from "vitest";
import { PAGE_SIZE, toRow } from "@nekan/shared/sync";
import type { Task } from "@nekan/shared/types";

/** The one module below the store that would need a device. */
vi.mock("../../store/persist", () => ({
  load: async () => ({ tasks: [], settings: {} }),
  save: async () => {},
  storePath: () => "/nowhere/data.json",
}));

const request = vi.fn();
vi.mock("../../api/http", () => ({
  request: (...args: unknown[]) => request(...args),
  errorCode: () => "error",
}));

const { pull, push } = await import("../transfer");
const { allTasks, setTasks } = await import("../../store/state");

/* ---------------------------------------------------------------- fixtures */

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
    completedAt: null,
    deletedAt: null,
    purgedAt: null,
    ...over,
  };
}

/** A row as the server hands it back: the columns, plus the sequence. */
const row = (over: Partial<Task>, seq: number) => ({
  ...toRow(task(over), "u1"),
  server_seq: seq,
});

/**
 * A full page, which is what makes `pull` ask for another one.
 *
 * `hasMore` is `rows.length >= PAGE_SIZE`, so a page one row short ends the
 * loop -- meaning any test about paging has to build a real full page rather
 * than a couple of rows and a hope.
 */
const fullPage = (from: number) =>
  Array.from({ length: PAGE_SIZE }, (_, i) =>
    row({ id: `p${from + i}`, updatedAt: 2000 }, from + i),
  );

const ok = (body: unknown) => ({ ok: true, status: 200, body });
const dead = { ok: false, status: 0, body: null };

beforeEach(() => {
  request.mockReset();
  setTasks([]);
});

/* -------------------------------------------------------------------- pull */

describe("pull", () => {
  test("asks from the cursor it was given", async () => {
    request.mockResolvedValue(ok([]));
    await pull("tok", 42, 0);
    expect(String(request.mock.calls[0][0])).toContain("server_seq=gt.42");
  });

  test("applies each page as it arrives, not at the end", async () => {
    // The one that matters on a first sync: a hundred pages that only land if
    // all hundred arrive is a sync that never finishes on a bad connection.
    const seen: number[] = [];
    request.mockImplementation(async () => {
      // What the store holds *before* this reply is applied.
      seen.push(allTasks().length);
      return request.mock.calls.length === 1
        ? ok(fullPage(1))
        : ok([row({ id: "last", updatedAt: 2000 }, 9000)]);
    });

    const result = await pull("tok", 0, 0);

    expect(seen).toEqual([0, PAGE_SIZE]);
    expect(result.applied).toBe(PAGE_SIZE + 1);
    expect(result.cursor).toBe(9000);
  });

  test("keeps what landed when a later page fails, and reports how far it got", async () => {
    request.mockResolvedValueOnce(ok(fullPage(1))).mockResolvedValueOnce(dead);

    const result = await pull("tok", 0, 0);

    expect(result.ok).toBe(false);
    // Not zero: the next run has to resume from here, or the rows that did
    // arrive get read again and the ones after them wait for a full reconcile.
    expect(result.cursor).toBe(PAGE_SIZE);
    expect(allTasks()).toHaveLength(PAGE_SIZE);
  });

  test("counts an edit this device had not sent yet and lost", async () => {
    setTasks([
      task({ id: "mine", updatedAt: 500 }), // edited here, not pushed
      task({ id: "sent", updatedAt: 100 }), // already up
    ]);
    request.mockResolvedValue(
      ok([
        row({ id: "mine", text: "다른 기기", updatedAt: 900 }, 1),
        row({ id: "sent", text: "다른 기기", updatedAt: 900 }, 2),
      ]),
    );

    // Watermark 300: "mine" is past it and "sent" is not.
    const result = await pull("tok", 0, 300);

    expect(result.applied).toBe(2);
    expect(result.overwritten).toBe(1);
  });

  test("counts nothing when the local copy stood its ground", async () => {
    setTasks([task({ id: "mine", updatedAt: 900 })]);
    request.mockResolvedValue(ok([row({ id: "mine", updatedAt: 500 }, 1)]));

    const result = await pull("tok", 0, 300);

    expect(result.applied).toBe(0);
    expect(result.overwritten).toBe(0);
    expect(allTasks()[0].updatedAt).toBe(900);
  });

  test("stops rather than spinning when a full page does not move the cursor", async () => {
    // Should be impossible -- server_seq is a sequence and the filter is `gt`
    // -- which is exactly why refusing beats trusting. Trusting is a loop that
    // asks the same page forever.
    request.mockResolvedValue(
      ok(fullPage(0).map((r) => ({ ...r, server_seq: 0 }))),
    );

    const result = await pull("tok", 0, 0);

    expect(request).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
  });

  test("normalizes what another device wrote", async () => {
    // These rows were written by some other build, and nothing on the way in
    // has checked them. An inbox row carrying a space is the one shape that
    // breaks the rule the whole board rests on.
    request.mockResolvedValue(
      ok([row({ id: "bad", quadrant: "inbox", space: "work" }, 1)]),
    );

    await pull("tok", 0, 0);

    expect(allTasks()[0].space).toBe(null);
  });
});

/* -------------------------------------------------------------------- push */

describe("push", () => {
  test("says nothing to send rather than sending nothing", async () => {
    setTasks([task({ id: "old", updatedAt: 100 })]);

    const result = await push("tok", "u1", 500);

    expect(request).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, pushedAt: 500, sent: 0 });
  });

  test("batches by the page size", async () => {
    setTasks(
      Array.from({ length: PAGE_SIZE + 1 }, (_, i) =>
        task({ id: `t${i}`, updatedAt: 2000 }),
      ),
    );
    request.mockResolvedValue(ok(null));

    const result = await push("tok", "u1", 0);

    expect(request).toHaveBeenCalledTimes(2);
    expect((request.mock.calls[0][1] as { body: unknown[] }).body).toHaveLength(
      PAGE_SIZE,
    );
    expect(result.sent).toBe(PAGE_SIZE + 1);
  });

  test("keeps the old watermark when a batch fails", async () => {
    // The one that loses data quietly: a watermark moved over a half-sent list
    // leaves everything after the failure behind for good, because the next
    // run no longer considers those rows pending.
    setTasks(
      Array.from({ length: PAGE_SIZE + 1 }, (_, i) =>
        task({ id: `t${i}`, updatedAt: 2000 }),
      ),
    );
    request.mockResolvedValueOnce(ok(null)).mockResolvedValueOnce(dead);

    const result = await push("tok", "u1", 700);

    expect(result.ok).toBe(false);
    expect(result.pushedAt).toBe(700);
  });

  test("moves the watermark to the newest thing it sent", async () => {
    setTasks([
      task({ id: "a", updatedAt: 900 }),
      task({ id: "b", updatedAt: 1500 }),
    ]);
    request.mockResolvedValue(ok(null));

    const result = await push("tok", "u1", 800);

    expect(result.pushedAt).toBe(1500);
  });

  test("sends rows, not tasks, and stamps them with the account", async () => {
    setTasks([task({ id: "a", updatedAt: 900, dueDate: "2026-09-09" })]);
    request.mockResolvedValue(ok(null));

    await push("tok", "u1", 0);

    const sent = (
      request.mock.calls[0][1] as { body: Record<string, unknown>[] }
    ).body[0];
    expect(sent.user_id).toBe("u1");
    expect(sent.due_date).toBe("2026-09-09");
    // The server stamps this one. Sending it would be a device deciding its
    // own place in the sequence.
    expect("server_seq" in sent).toBe(false);
  });
});

/* Not covered here: the MAX_PAGES cap, which would need 200,000 rows to
   reach. It returns the cursor it stopped at, so the next run resumes -- the
   thing worth watching is the console line it prints, and that is the point
   of it. */
