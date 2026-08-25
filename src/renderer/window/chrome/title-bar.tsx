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
import { cn } from "../../react/cn.js";
import { Dot } from "../../components/dot.js";
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
  isPinned,
  setTab,
} from "./state.js";

/**
 * One window button. `win-btn` stays as a name because welcome.css reaches two
 * of these by id and says so, and because it is what the bar is read by from
 * outside. Nothing defines it any more.
 */
const WIN_BTN =
  "win-btn grid h-[30px] w-[30px] place-items-center rounded-md border-0 " +
  "bg-transparent text-muted hover:bg-panel-3 hover:text-text";

/* ------------------------------------------------------------- components */

/** One count chip. In a bar these are the only thing on screen. */
function Chip({ place, count }: { place: Place; count: number }) {
  const key =
    place === INBOX
      ? "titlebar.countInbox"
      : `titlebar.count${place.toUpperCase()}`;
  return (
    <button
      className={cn(
        // `chip` is collapsed.css's name for these, and it is the one thing on
        // screen in bar mode.
        "chip flex items-center gap-sm rounded-pill border border-line",
        "bg-panel-2 px-md py-xs text-muted",
        "hover:border-line-strong hover:bg-panel-3 hover:text-text",
        place === INBOX && "inbox-chip",
        place === INBOX && count === 0 && "hidden",
      )}
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
      <Dot place={place} as="i" />
      <b
        className="tabular-nums text-text"
        id={place === INBOX ? "cInbox" : `c${place[1]}`}
      >
        {count}
      </b>
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
      <div className="flex min-w-[0px] items-center gap-md">
        <img
          className="h-[18px] w-[18px] flex-none [-webkit-user-drag:none]"
          src="../assets/icon.png"
          alt=""
        />
        {/* The app's own name, and the one word in the bar that is a title
            rather than a label -- so it takes the title rank the quadrant
            headings use. `title` is collapsed.css's name for it. */}
        <span className="title overflow-hidden font-semibold tracking-wide text-ellipsis whitespace-nowrap">
          Nekan
        </span>
        {/* Costs the bar nothing: collapsed.css drops it with the app name,
            the way the export button goes. Only the number is here — the
            update state and the release link are in the guide, which is where
            someone goes to read rather than to work. */}
        <span
          className="app-version flex-none text-xs text-faint tabular-nums whitespace-nowrap"
          id="titleVersion"
        >
          {currentVersion()}
        </span>
      </div>

      {/* Which matrix is on screen. It sits in the title bar because it scopes
          the whole app — the quadrants, the counts, history, trash and the
          export all follow it. The one thing it does NOT scope is the inbox
          below, which is why that panel says so on its own header. */}
      <div
        className="switch [-webkit-app-region:no-drag]"
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

      <div
        className="bar-summary ml-auto flex items-center gap-sm [-webkit-app-region:no-drag]"
        id="barSummary"
      >
        {/* Hidden while the inbox is empty, so a visible count always means
            "there is something you have not classified yet". */}
        <Chip place={INBOX} count={waiting} />
        {QUADS.map((quad) => (
          <Chip key={quad} place={quad} count={activeOf(quad).length} />
        ))}
      </div>

      <div className="ml-sm flex items-center gap-2xs [-webkit-app-region:no-drag]">
        {/* The one button that is not always here. It appears only once a new
            version has finished downloading, so seeing it at all is the
            message; until then the update is silent and would be applied on
            quit anyway. It stays in bar mode on purpose — that is where this
            widget is usually left, and `BAR.width` is sized to hold it. */}
        <button
          className={cn(
            WIN_BTN,
            // Accent rather than the muted window-button grey: it is only ever
            // on screen when there is something to act on. It has to name the
            // hover as well, or the shared hover above would grey it on the way
            // past -- which is what the old rule meant by the id outranking
            // `.win-btn:hover`.
            "bg-accent-soft text-accent",
            "hover:bg-accent-soft hover:text-accent",
            "hover:shadow-[inset_0_0_0_1px_var(--accent)]",
            !updateReady && "hidden",
          )}
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
          className={WIN_BTN}
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
          className={cn(
            WIN_BTN,
            // The hover has to be named too, the same as the update button
            // above. `.win-btn.on` and `.win-btn:hover` were the same
            // specificity and `.on` came later, so a pinned button kept its
            // accent under the pointer; a hover utility outranks a plain one,
            // so without saying this the pin goes grey when you reach for it.
            isPinned() &&
              "bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent",
          )}
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
          className={WIN_BTN}
          id="sizeBtn"
          type="button"
          title={t(sizeKey)}
          aria-label={t(sizeKey)}
          onClick={toggleSize}
        >
          <ShrinkIcon />
        </button>
        <button
          className={WIN_BTN}
          id="minBtn"
          type="button"
          title={t("titlebar.minimize")}
          aria-label={t("titlebar.minimize")}
          onClick={() => window.api.minimize()}
        >
          <MinimiseIcon />
        </button>
        <button
          className={cn(WIN_BTN, "hover:bg-danger-soft hover:text-danger")}
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
