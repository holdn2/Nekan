/**
 * What the home-screen widget is handed: the board, written out for Swift.
 *
 * The widget runs in its own process and cannot read `data.json`, the store or
 * the catalogue. So everything it shows is decided here and passed across the
 * App Group as one JSON string -- both boards, all four quadrants, and the
 * words to draw them with. The widget then only picks which slice to show;
 * switching board or quadrant inside the widget never has to wake the app.
 *
 * Pure: tasks, a clock and a translator in, a plain object out. The part that
 * touches the device is publish.ts.
 *
 * The words travel in the snapshot rather than in the widget's own string
 * catalogue, and that is deliberate. A catalogue compiled into the extension
 * follows the phone's language; these follow the language chosen in the app,
 * which is what the person set Nekan to. The quadrant colours travel for the
 * same reason the words do -- theme.ts is their one home, and copying hex into
 * Swift would be a third place nobody's check watches.
 */
import {
  QUADS,
  SPACES,
  compareOrder,
  dueInfo,
  formatDue,
} from "@nekan/shared/core";
import { isBuried } from "@nekan/shared/sync";
import { PALETTE } from "@nekan/shared/theme";
import type { Quadrant, Space, Task } from "@nekan/shared/types";

/**
 * Bumped when the shape changes in a way an older widget would misread.
 *
 * The widget reads exactly this number (`supportedVersion` in
 * BoardWidget.swift) and shows "open the app" for anything else. The app moves
 * by OTA and the widget only by a build, so **bumping this without a build
 * blanks every widget already installed** -- change it in the same release as
 * the Swift that reads the new shape.
 */
export const FEED_VERSION = 1;

/**
 * How many rows of one quadrant are sent.
 *
 * The widget shows as many as its height holds -- about twelve at most, on
 * the largest phone's large size -- so this is five pages of that. The count
 * sent beside the rows is the real one, so a longer list still says how long
 * it is.
 */
export const FEED_ROWS = 60;

export interface FeedRow {
  id: string;
  text: string;
  /** `YYYY-MM-DD`, so the widget can tell overdue from today on its own clock. */
  due: string | null;
  /** The chip's words, in the app's language, fixed when written. */
  dueText: string | null;
  /** What VoiceOver reads on the row's circle -- the app's words for it. */
  doneLabel: string;
}

export interface FeedQuadrant {
  count: number;
  rows: FeedRow[];
}

export interface Feed {
  v: number;
  /** When this was written, in the app's clock. For diagnosis only. */
  at: number;
  /**
   * The app's clock minus the phone's, in ms. A check made in the widget is
   * stamped with the time it was tapped, and that stamp meets every other
   * device's in the merge -- so it has to be on the same clock they are, which
   * is the server's (store/state.ts `now()`), not the phone's own.
   */
  offset: number;
  lang: string;
  /** The board the app is showing, which the widget starts on. */
  space: Space;
  labels: {
    spaces: Record<Space, string>;
    /** The full name, for the title line. */
    quads: Record<Quadrant, string>;
    empty: string;
    /** For the page buttons and the quadrant dots, read by VoiceOver. */
    previous: string;
    next: string;
    /** For a circle that is already checked: pressing it takes the check back. */
    undo: string;
    /** The one button that opens the app, read by VoiceOver. */
    openInApp: string;
  };
  /**
   * The theme chosen in the app, or null to follow the phone -- the same rule
   * the app's own screens use, so the widget is never the one light square on
   * a board somebody set dark.
   */
  theme: "light" | "dark" | null;
  /** The palette roles the widget draws with, both themes. See WIDGET_ROLES. */
  colors: Record<"light" | "dark", Record<WidgetRole, string>>;
  boards: Record<Space, Record<Quadrant, FeedQuadrant>>;
}

/**
 * Every colour the widget uses, by the name the app's screens use for it.
 *
 * The widget is drawn with the app's design system rather than iOS's system
 * colours: its background is the list panel, its switch is the header's, its
 * due chip is the row's. Sending the roles rather than hex written into Swift
 * keeps theme.ts the one place a colour is decided.
 */
export const WIDGET_ROLES = [
  ...QUADS,
  // A checked circle is filled with these and ticked in on-quad: the plain
  // quadrant colour is too light under white in the dark theme.
  "q1-fill",
  "q2-fill",
  "q3-fill",
  "q4-fill",
  "panel",
  "panel-2",
  "line",
  "text",
  "muted",
  "faint",
  "disabled",
  "accent",
  "on-accent",
  "danger",
  "on-quad",
] as const;
export type WidgetRole = (typeof WIDGET_ROLES)[number];

type Translate = (key: string, vars?: Record<string, unknown>) => string;

/**
 * Active on the board: not buried, not trashed, not done.
 *
 * `isBuried` rather than `!task.purgedAt` because 0 is a real stamp and
 * truthiness would read it as "never". The other two follow suit.
 */
const isActive = (task: Task) =>
  !isBuried(task) && task.deletedAt == null && task.completedAt == null;

function row(task: Task, t: Translate, locale: string, now: Date): FeedRow {
  const info = dueInfo(task.dueDate, now);
  return {
    id: task.id,
    text: task.text,
    due: info ? (task.dueDate as string) : null,
    dueText: formatDue(info, t, locale)?.text ?? null,
    doneLabel: t("item.completeLabel", { text: task.text }),
  };
}

export function buildFeed(
  tasks: readonly Task[],
  {
    space,
    lang,
    t,
    now,
    stamp,
    theme = null,
  }: {
    space: Space;
    lang: string;
    t: Translate;
    /** Today, for the due chips -- the same clock the list screens use. */
    now: Date;
    /** The store's `now()`, so the written time agrees with every other stamp. */
    stamp: number;
    /** The app's theme choice; null follows the phone. */
    theme?: "light" | "dark" | null;
  },
): Feed {
  const boards = {} as Feed["boards"];
  for (const board of SPACES) {
    const quads = {} as Record<Quadrant, FeedQuadrant>;
    for (const q of QUADS) {
      // The dump is not here on purpose: its `space` is null and it belongs to
      // neither board, and the widget shows quadrants only.
      const active = tasks
        .filter((task) => task.quadrant === q && task.space === board)
        .filter(isActive)
        .sort(compareOrder);
      quads[q] = {
        count: active.length,
        rows: active.slice(0, FEED_ROWS).map((task) => row(task, t, lang, now)),
      };
    }
    boards[board] = quads;
  }

  const pick = (name: "light" | "dark") =>
    Object.fromEntries(
      WIDGET_ROLES.map((role) => [role, PALETTE[name][role]]),
    ) as Record<WidgetRole, string>;

  return {
    v: FEED_VERSION,
    at: stamp,
    offset: stamp - now.getTime(),
    lang,
    space,
    theme,
    labels: {
      spaces: { work: t("space.work"), life: t("space.life") },
      quads: Object.fromEntries(
        QUADS.map((q) => [q, t(`quad.${q}.action`)]),
      ) as Record<Quadrant, string>,
      empty: t("matrix.empty"),
      // The history screen's words for the same act, not new ones.
      previous: t("archive.pagePrev"),
      next: t("archive.pageNext"),
      // The history's word for taking a completion back.
      undo: t("archive.restore"),
      openInApp: t("widget.openInApp"),
    },
    colors: { light: pick("light"), dark: pick("dark") },
    boards,
  };
}
