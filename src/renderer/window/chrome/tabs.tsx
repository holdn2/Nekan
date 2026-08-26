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
              // Underlined, following the `line` variant of the ported
              // components/ui/tabs.tsx: a 2px rule drawn by ::after and turned
              // on with opacity, sitting on the baseline the strip carries.
              // Taken over a filled pill because ink is weak as a fill and
              // strong as a rule -- the same property that made swapping the
              // accent colour almost invisible works in our favour here. It
              // also keeps the strip to one surface, which matters in dark
              // where panel and panel-2 are closer together than in light.
              // border-0 and bg-transparent are not decoration: there is no
              // Tailwind preflight here, so a bare <button> keeps the operating
              // system's own border and fill. Dropping them turned all four
              // tabs into outlined boxes.
              "tab relative flex items-center gap-sm border-0 bg-transparent",
              "px-2xl py-md leading-none",
              // Inset by the tab's own px-2xl, so the rule is as wide as the label
              // rather than as wide as the hit target. Tied to the padding on
              // purpose: change one and the other has to follow.
              "after:absolute after:inset-x-2xl after:bottom-[-1px]",
              "after:h-2xs after:bg-text after:opacity-0 after:transition-opacity",
              getTab() === tab
                ? "font-medium text-text after:opacity-100"
                : "text-muted hover:text-text",
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
