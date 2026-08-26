/**
 * The tab strip, and the two lines in the guide that report on the app itself.
 *
 * The update line and the version both read pushed values, so they subscribe
 * like everything else rather than being written once and relabelled.
 *
 * Which section is on screen is this component's too. The four <section>s and
 * the dump are index.html's -- they hold the whole app, and one of them is the
 * guide, which is markup rather than components -- so they are shown and
 * hidden rather than rendered. Doing it here, from the same answer the buttons
 * above are drawn from, is what makes "the tab says one thing and the screen
 * shows another" impossible instead of remembered.
 */

import { useEffect } from "react";
import {
  CircleHelp,
  Clock,
  Grid2x2,
  type LucideIcon,
  Trash2,
} from "lucide-react";

import { Badge } from "../../components/badge.js";
import { cn } from "../../react/cn.js";
import { t } from "../../i18n.js";
import { $ } from "../../dom.js";
import { doneTasks, trashedTasks } from "../../store.js";
import { useRenderSignal } from "../../react/use-store.js";
import {
  UPDATE_TEXT,
  currentUpdate,
  currentVersion,
  getTab,
  setTab,
} from "./state.js";

/** The sections a tab shows, in the order they sit in index.html. */
const VIEWS: Record<string, string> = {
  matrix: "#matrixView",
  history: "#historyView",
  trash: "#trashView",
  guide: "#guideView",
};

/**
 * One icon per tab, added 2026-08-26. No hand-drawn icon existed here to
 * match, so the stroke is picked to sit in the same optical-weight family as
 * the rest of the chrome rather than derived from a prior value: target
 * effective stroke ~1.0px (react/icons.tsx's family runs 0.9-1.1px at its
 * sizes), so strokeWidth = 1.0 * 24/14 = 1.71, rounded to 1.75.
 */
const TAB_ICONS: Record<string, LucideIcon> = {
  matrix: Grid2x2,
  history: Clock,
  trash: Trash2,
  guide: CircleHelp,
};

function Tabs() {
  useRenderSignal();

  // Every render, not once: the effect is how the sections learn, so it has to
  // run whenever the answer it reads can have changed.
  useEffect(() => {
    const tab = getTab();
    for (const [name, selector] of Object.entries(VIEWS))
      $(selector).classList.toggle("hidden", tab !== name);
    // The dump belongs to the matrix and leaves with it.
    $("#inboxPanel").classList.toggle("hidden", tab !== "matrix");
  });

  const badges: Record<string, number> = {
    history: doneTasks().length,
    trash: trashedTasks().length,
  };

  return (
    <>
      {["matrix", "history", "trash", "guide"].map((tab) => {
        const Icon = TAB_ICONS[tab];
        return (
          <button
            key={tab}
            className={cn(
              // `tab` is kept only because the active one is found by it in
              // tests and by anything looking in from outside; nothing styles it.
              // Rounded all round, not just at the top: the strip shares its
              // surface with the title bar above, so a tab is a pill sitting on
              // that surface rather than a folder tab breaking a line. The
              // active one is tinted for the same reason -- it used to be white
              // against a grey strip, and white on white says nothing.
              "tab flex items-center gap-sm rounded-md border px-2xl py-md",
              "leading-none",
              getTab() === tab
                ? "border-line bg-accent-soft font-medium text-text"
                : "border-transparent bg-transparent text-muted hover:text-text",
            )}
            type="button"
            data-tab={tab}
            onClick={() => setTab(tab)}
          >
            <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
            {/* The label is wrapped so the badge beside it survives as its own
                element rather than sharing a text node with it. */}
            <span>{t(`tabs.${tab}`)}</span>
            {tab in badges ? (
              <Badge id={tab === "history" ? "doneCount" : "trashCount"}>
                {badges[tab]}
              </Badge>
            ) : null}
          </button>
        );
      })}
    </>
  );
}

/** The line in the guide tab that says where the update is up to. */
function UpdateLine() {
  useRenderSignal();
  const key = UPDATE_TEXT[currentUpdate()?.state ?? ""];
  const update = currentUpdate();
  const shown = update?.version ? ` ${update.version}` : "";
  return <>{key ? t(key, { version: shown }) : ""}</>;
}

/** The version in the guide tab, beside that line. */
function GuideVersion() {
  useRenderSignal();
  return <>{currentVersion() || "—"}</>;
}

export { Tabs, UpdateLine, GuideVersion };
