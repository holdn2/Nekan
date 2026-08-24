/**
 * The title bar and the tab strip.
 *
 * This is the window's own furniture: which board is on screen, what is in each
 * quadrant, which tab is open, and the five buttons at the right-hand end. The
 * bar mode this widget is usually left in is *this* strip and nothing else, so
 * everything here has to be readable at 48px tall.
 *
 * Only main decides the mode, the pin and the update state; this repaints for
 * whatever it decided. That is why those arrive through the apply* functions
 * rather than being asked for.
 */

import { createRoot } from "react-dom/client";
import { INBOX, QUADS } from "../../shared/core.js";
import type { Place } from "../../shared/types.js";
import { t } from "../i18n.js";
import { $, $$ } from "../dom.js";
import { notify } from "../render-bus.js";
import { toast } from "../components/toast.js";
import {
  activeOf,
  doneTasks,
  getSpace,
  inboxTasks,
  setSpace,
  trashedTasks,
} from "../store.js";
import { setSelected } from "../selection.js";
import { applyInboxOpen } from "../views/inbox.js";
import { resetArchivePaging } from "../views/archive.js";
import { getMode, toggleSize } from "./mode.js";
import { isSettingsOpen, toggleSettings } from "../panels.js";
import { useRenderSignal } from "../react/use-store.js";
import {
  QuitIcon,
  CogIcon,
  MinimiseIcon,
  PinIcon,
  ShrinkIcon,
  UpdateIcon,
} from "../react/window-icons.js";

/**
 * What main reports about an available update.
 *
 * Read off the bridge rather than written out again: preload declares the
 * payload, `window.api` is `typeof api`, and a second copy of the shape here
 * is a second thing to keep in step. The last copy said `version?: string`
 * while main was sending null.
 */
type UpdateStatus = Parameters<
  Parameters<typeof window.api.onUpdateStatus>[0]
>[0];

let activeTab = "matrix";
let theme = "light";
/** The version already announced, so the toast fires once per download. */
let announced: string | null = null;
/** Last values pushed in, kept so a redraw can say them again. */
let pinned = true;
let updateStatus: UpdateStatus | null = null;
let version = "";

/** 'matrix' | 'history' | 'trash' | 'guide'. */
export const getTab = () => activeTab;
/** Which palette is on. The settings panel draws its segment from this. */
export const getTheme = () => theme;

/* ------------------------------------------------------------------ boards */

/** Switch boards. `persist` is false while replaying the saved choice. */
export function applySpace(next: unknown, persist = true) {
  const space = setSpace(next);
  if (persist) window.api.setSpace(space);
  notify();
}

/* -------------------------------------------------------------------- tabs */

/** Show one view and hide the rest, then redraw whatever it needs. */
export function setTab(tab: string) {
  // The panel belongs to the matrix; leaving the tab closes it (and gives the
  // window its height back) rather than leaving it pointing at a hidden row.
  if (tab !== "matrix") setSelected(null);
  // A list someone expanded with 더 보기 goes back to one page. Leaving it open
  // makes every later redraw pay for a choice made once and forgotten.
  resetArchivePaging();
  activeTab = tab;
  // The five sections are index.html's, not this component's -- they hold the
  // whole app -- so they are shown and hidden here rather than rendered.
  $("#inboxPanel").classList.toggle("hidden", tab !== "matrix");
  $("#matrixView").classList.toggle("hidden", tab !== "matrix");
  $("#historyView").classList.toggle("hidden", tab !== "history");
  $("#trashView").classList.toggle("hidden", tab !== "trash");
  $("#guideView").classList.toggle("hidden", tab !== "guide");
  notify();
}

/* ------------------------------------------------------------ theme / pin */

/** Swap the palette. The stylesheet keys off data-theme on <html>. */
export function applyTheme(next: string, persist = true) {
  theme = next === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  notify();
  if (persist) window.api.setTheme(theme);
}

/** Ctrl+D and the settings panel both come through here. */
export function toggleTheme() {
  applyTheme(theme === "dark" ? "light" : "dark");
}

/** Reflect the always-on-top state main.js reports back. */
export function applyPinned(on: boolean) {
  pinned = on;
  notify();
}

/* ----------------------------------------------------------------- update */

/** Show the running version. It cannot change while the app is open. */
export function applyVersion(next: string | null) {
  version = next || "";
  notify();
}

/**
 * What the guide tab says about updates, in the caller's own words.
 *
 * `announce` splits news from state, and only news is worth interrupting for. A
 * pushed status is news: something finished downloading just now. The one that
 * comes back with state:load is not — it is how things already were, and the
 * renderer asking for it has either just started or just reloaded. The button
 * belongs to both; the toast belongs only to the first.
 */
export function applyUpdateStatus(
  status: UpdateStatus | null,
  { announce = false } = {},
) {
  updateStatus = status;
  notify();

  if (status?.state !== "ready") return;
  if (!announce || announced === status?.version) return;
  announced = status?.version ?? null;

  // Both strings put the version somewhere a Korean particle never follows it:
  // the one that would (…1.0.1'은' / …1.0.2'는') depends on how the last digit
  // is read aloud, and no single wording is right for every release. The space
  // travels with the number so the sentence closes up when there is none.
  const shown = status.version ? ` ${status.version}` : "";
  // No toast in a bar — collapsed.css hides it — but the button is there, and
  // the update lands on the next quit regardless.
  toast(t("update.toast", { version: shown }), {
    ms: 10000,
    action: {
      label: t("update.restart"),
      onClick: () => window.api.installUpdate(),
    },
  });
}

/** What the guide tab's line says, for each state main can report. */
const UPDATE_TEXT: Record<string, string> = {
  checking: "update.checking",
  latest: "update.latest",
  downloading: "update.downloading",
  ready: "update.ready",
  error: "update.error",
};

/* ------------------------------------------------------------- components */

/** One count chip. In a bar these are the only thing on screen. */
function Chip({ place, count }: { place: Place; count: number }) {
  const key =
    place === INBOX
      ? "titlebar.countInbox"
      : `titlebar.count${place.toUpperCase()}`;
  return (
    <button
      className={`chip${place === INBOX ? " inbox-chip" : ""}${place === INBOX && count === 0 ? " hidden" : ""}`}
      id={place === INBOX ? "inboxChip" : undefined}
      type="button"
      data-jump={place}
      aria-label={t(key)}
      onClick={() => {
        // Only in a bar: expanded, the quadrant is already on screen.
        if (getMode() !== "collapsed") return;
        window.api.expand();
        setTab("matrix");
        // The inbox chip is only there when something is waiting in it, so
        // clicking it means "show me those" — unfold on the way out of bar
        // mode. No focus here: the window is still resizing and would swallow
        // it.
        if (place === INBOX) applyInboxOpen(true);
      }}
    >
      <i className={`dot ${place}`} />
      <b id={place === INBOX ? "cInbox" : `c${place[1]}`}>{count}</b>
    </button>
  );
}

function TitleBar() {
  useRenderSignal();
  const space = getSpace();
  const waiting = inboxTasks().length;

  // The size button says what it will do, which changes with the mode.
  const sizeKey =
    getMode() === "collapsed" ? "titlebar.expand" : "titlebar.collapse";
  const updateReady = updateStatus?.state === "ready";

  return (
    <>
      <div className="brand">
        <img className="logo" src="../assets/icon.png" alt="" />
        <span className="title">Nekan</span>
        {/* Costs the bar nothing: collapsed.css drops it with the app name,
            the way the export button goes. Only the number is here — the
            update state and the release link are in the guide, which is where
            someone goes to read rather than to work. */}
        <span className="app-version" id="titleVersion">
          {version}
        </span>
      </div>

      {/* Which matrix is on screen. It sits in the title bar because it scopes
          the whole app — the quadrants, the counts, history, trash and the
          export all follow it. The one thing it does NOT scope is the inbox
          below, which is why that panel says so on its own header. */}
      <div
        className="switch space-switch"
        id="spaceSwitch"
        role="group"
        aria-label={t("titlebar.boards")}
      >
        {(["work", "life"] as const).map((which) => (
          <button
            key={which}
            className={`switch-btn${space === which ? " active" : ""}`}
            type="button"
            data-space={which}
            aria-pressed={space === which}
            onClick={() => {
              if (space === which) return;
              applySpace(which);
            }}
          >
            {t(`space.${which}`)}
          </button>
        ))}
      </div>

      <div className="bar-summary" id="barSummary">
        {/* Hidden while the inbox is empty, so a visible count always means
            "there is something you have not classified yet". */}
        <Chip place={INBOX} count={waiting} />
        {QUADS.map((quad) => (
          <Chip key={quad} place={quad} count={activeOf(quad).length} />
        ))}
      </div>

      <div className="win-actions">
        {/* The one button that is not always here. It appears only once a new
            version has finished downloading, so seeing it at all is the
            message; until then the update is silent and would be applied on
            quit anyway. It stays in bar mode on purpose — that is where this
            widget is usually left, and `BAR.width` is sized to hold it. */}
        <button
          className={`win-btn${updateReady ? "" : " hidden"}`}
          id="updateBtn"
          type="button"
          title={t("titlebar.updateReady")}
          aria-label={t("titlebar.updateReady")}
          onClick={() => window.api.installUpdate()}
        >
          <UpdateIcon />
        </button>
        {/* Theme and export used to be two buttons here. They are one panel
            now, which costs the bar one button instead of two — and the dot
            gives sync a signal the bar can afford, where the old 56px chip
            could not. */}
        {/* The name is here as well as in the account panel, which overwrites
            both title and aria-label with the sync state once it has one. Its
            two children are aria-hidden, so without this the button has no
            accessible name at all until that panel has mounted. */}
        <button
          className="win-btn"
          id="settingsBtn"
          type="button"
          title={t("settings.title")}
          aria-label={t("settings.title")}
          aria-expanded={isSettingsOpen()}
          onClick={toggleSettings}
        >
          <CogIcon />
          <i className="sync-dot" aria-hidden="true" />
        </button>
        <button
          className={`win-btn${pinned ? " on" : ""}`}
          id="pinBtn"
          type="button"
          title={t(pinned ? "titlebar.unpin" : "titlebar.pin")}
          aria-label={t(pinned ? "titlebar.unpin" : "titlebar.pin")}
          onClick={async () => {
            // main is the authority on the pin state, so the button only ever
            // reflects what it answers. If the call fails there is nothing new
            // to reflect — leave it alone rather than showing a state we did
            // not reach.
            try {
              applyPinned(await window.api.togglePin());
            } catch (err) {
              console.error("togglePin failed", err);
            }
          }}
        >
          <PinIcon />
        </button>
        <button
          className="win-btn"
          id="sizeBtn"
          type="button"
          title={t(sizeKey)}
          aria-label={t(sizeKey)}
          onClick={toggleSize}
        >
          <ShrinkIcon />
        </button>
        <button
          className="win-btn"
          id="minBtn"
          type="button"
          title={t("titlebar.minimize")}
          aria-label={t("titlebar.minimize")}
          onClick={() => window.api.minimize()}
        >
          <MinimiseIcon />
        </button>
        <button
          className="win-btn danger"
          id="closeBtn"
          type="button"
          title={t("titlebar.close")}
          aria-label={t("titlebar.close")}
          onClick={() => window.api.close()}
        >
          <QuitIcon />
        </button>
      </div>
    </>
  );
}

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
          className={`tab${activeTab === tab ? " active" : ""}`}
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
  const key = UPDATE_TEXT[updateStatus?.state ?? ""];
  const shown = updateStatus?.version ? ` ${updateStatus.version}` : "";
  return <>{key ? t(key, { version: shown }) : ""}</>;
}

/** The version in the guide tab, beside that line. */
function GuideVersion() {
  useRenderSignal();
  return <>{version || "—"}</>;
}

/* ----------------------------------------------------------------- wiring */

/**
 * Fill the title bar and the tab strip, and bind the two things that are not
 * buttons: a double-click on the bar, and the guide's outward links.
 */
export function mountChrome() {
  const bar = document.querySelector(".titlebar");
  if (bar) createRoot(bar).render(<TitleBar />);
  const tabs = document.querySelector(".tabs");
  if (tabs) createRoot(tabs).render(<Tabs />);
  const state = document.getElementById("updateState");
  if (state) createRoot(state).render(<UpdateLine />);
  const shown = document.getElementById("appVersion");
  if (shown) createRoot(shown).render(<GuideVersion />);

  // Opens in the real browser. Loading GitHub into this window would put a web
  // page where the widget was, with no way back — there is no chrome to it.
  $("#releaseNotes").addEventListener("click", () =>
    window.api.openReleaseNotes(),
  );
  $("#guidePrivacy").addEventListener("click", () =>
    window.api.openPrivacyPolicy(),
  );

  bar?.addEventListener("dblclick", (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    toggleSize();
  });
}

/** Kept for app.ts, which counts the tabs to size the guide's own list. */
export const tabButtons = () => $$(".tab");
