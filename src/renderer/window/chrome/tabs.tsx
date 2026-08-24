/**
 * The tab strip, and the two lines in the guide that report on the app itself.
 *
 * The update line and the currentVersion() both read pushed values, so they subscribe
 * like everything else rather than being written once and relabelled.
 */

import { t } from "../../i18n.js";
import { doneTasks, trashedTasks } from "../../store.js";
import { useRenderSignal } from "../../react/use-store.js";
import {
  UPDATE_TEXT,
  currentUpdate,
  currentVersion,
  getTab,
  setTab,
} from "./state.js";

function Tabs() {
  useRenderSignal();
  const badges: Record<string, number> = {
    history: doneTasks().length,
    trash: trashedTasks().length,
  };

  return (
    <>
      {["matrix", "history", "trash", "guide"].map((tab) => (
        <button
          key={tab}
          className={`tab${getTab() === tab ? " active" : ""}`}
          type="button"
          data-tab={tab}
          onClick={() => setTab(tab)}
        >
          {/* The label is wrapped so the badge beside it survives as its own
              element rather than sharing a text node with it. */}
          <span>{t(`tabs.${tab}`)}</span>
          {tab in badges ? (
            <span
              className="badge"
              id={tab === "history" ? "doneCount" : "trashCount"}
            >
              {badges[tab]}
            </span>
          ) : null}
        </button>
      ))}
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
