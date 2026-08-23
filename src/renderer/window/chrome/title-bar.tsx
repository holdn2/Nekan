/**
 * The bar across the top: the brand, the board switch, the five counts, and
 * the window buttons.
 *
 * It is also the whole of the app in bar mode, which is why BAR.width in
 * main/window.ts is decided by what is in here. Adding anything means
 * measuring again -- the note in CLAUDE.md says how, and English is always the
 * tighter of the two languages.
 */

import { INBOX, QUADS } from "../../../shared/core.js";
import type { Place } from "../../../shared/types.js";
import { t } from "../../i18n.js";
import { activeOf, getSpace, inboxTasks } from "../../store.js";
import { getMode, toggleSize } from "../mode.js";
import { isSettingsOpen, toggleSettings } from "../../panels.js";
import { applyInboxOpen } from "../../views/inbox.js";
import { useRenderSignal } from "../../react/use-store.js";
import {
  QuitIcon,
  CogIcon,
  MinimiseIcon,
  PinIcon,
  ShrinkIcon,
  UpdateIcon,
} from "../../react/window-icons.js";
import {
  applyPinned,
  applySpace,
  currentUpdate,
  currentVersion,
  getTab,
  isPinned,
  setTab,
} from "./state.js";

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
  const updateReady = currentUpdate()?.state === "ready";

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
          {currentVersion()}
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
          className={`win-btn${isPinned() ? " on" : ""}`}
          id="pinBtn"
          type="button"
          title={t(isPinned() ? "titlebar.unpin" : "titlebar.pin")}
          aria-label={t(isPinned() ? "titlebar.unpin" : "titlebar.pin")}
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

export { TitleBar };
