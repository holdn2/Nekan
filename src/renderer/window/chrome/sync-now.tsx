/**
 * What the sync is doing, and a button that makes it happen now.
 *
 * It lives in the title bar rather than in the settings panel because the
 * question it answers -- "is what I just typed anywhere but here?" -- is one
 * people ask while working, and a panel they have to open to see the answer is
 * a panel they will not open. The gear's dot stays: it is the version of this
 * that fits in a 48px bar, where these words do not.
 *
 * The button's real job is the backoff. After a run of failures the loop waits
 * up to five minutes, so somebody whose network just came back watches
 * "오프라인" with no way to say try again. `syncNow` in main resets `failures`
 * for exactly that, and this is the only thing that calls it.
 */

import { useEffect, useRef, useState } from "react";
import { formatAgo } from "../../../shared/core.js";
import { cn } from "../../react/cn.js";
import { t } from "../../i18n.js";
import { SyncIcon } from "../../react/icons.js";
import { useRenderSignal } from "../../react/use-store.js";
import {
  LABELS,
  currentStatus,
  displayState,
} from "../../views/account/status.js";

/**
 * Re-render on the clock, so "방금" stops saying so when it stops being true.
 *
 * Nothing else brings this back. The screen redraws when main pushes a new
 * status, and main stops pushing when nothing in it changes -- which is
 * exactly what a long stretch offline looks like: the same phase, the same
 * count, the same `syncedAt`, no push. The label would sit on "2분 전" for an
 * hour, which is worse than saying nothing, because this control exists to be
 * believed.
 *
 * Thirty seconds against a scale whose smallest step is a minute: the words
 * are never more than half a step stale, and the cost is one state change a
 * minute per open window.
 */
function useTick(active: boolean) {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => bump((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [active]);
}

export function SyncNow() {
  useRenderSignal();
  /**
   * Hold the button's "working" look for a moment after a press.
   *
   * Measured rather than guessed: a press goes to `syncing` at +9ms and back
   * to `synced` at +169ms, because the usual run is one request that finds
   * nothing new. Truthful and invisible -- the person pressed a button and the
   * screen never answered, which is the failure this whole control exists to
   * avoid. So the *look* is held while the *words* stay honest: they say
   * whatever is actually true, and this only keeps the icon busy long enough
   * to be seen.
   *
   * Above the early return, because hooks cannot be conditional: signing out
   * takes this component down the `off` branch, and a useState that ran on the
   * render before and not on this one is how React stops working entirely.
   */
  const [pressed, setPressed] = useState(false);
  const holding = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (holding.current) clearTimeout(holding.current);
    },
    [],
  );

  const press = () => {
    setPressed(true);
    if (holding.current) clearTimeout(holding.current);
    holding.current = setTimeout(() => setPressed(false), 600);
    void window.api.syncNow();
  };
  // `Date.now()` rather than the store's `now()`, and this is the one place
  // that is right. `now()` adds the offset between this device's clock and the
  // server's, which is what task timestamps need; `syncedAt` was stamped by
  // main on *this* machine, so adding the server's disagreement to a
  // same-machine subtraction would only make the answer worse.

  const status = currentStatus();
  const state = displayState(status);
  useTick(state !== "off");
  // Nobody signed in: there is nothing to sync and nothing to say about it.
  if (state === "off") return null;

  const words = LABELS[state]
    ? t(LABELS[state], { count: status?.unsent ?? 0 })
    : "";
  const ago = formatAgo(status?.syncedAt, Date.now(), t);
  const running = state === "syncing";
  const busy = running || pressed;

  return (
    <div
      className="sync-now flex min-w-[0px] items-center gap-sm"
      // Dragging the window by the words is fine; the button says otherwise
      // for itself.
      data-sync={state}
    >
      <button
        className={cn(
          // border-0 and bg-transparent are not decoration: there is no
          // Tailwind preflight here, so a bare <button> keeps the OS chrome --
          // a grey box with a border, which is what this looked like.
          "sync-btn [-webkit-app-region:no-drag] grid h-[22px] w-[22px] flex-none",
          "place-items-center rounded-md border-0 bg-transparent text-muted",
          "hover:bg-panel-3 hover:text-text",
          busy && "is-syncing",
        )}
        id="syncNowBtn"
        type="button"
        title={t("sync.now")}
        aria-label={t("sync.now")}
        onClick={press}
      >
        <SyncIcon />
      </button>
      <span className="overflow-hidden text-xs text-faint text-ellipsis whitespace-nowrap">
        {ago && !running ? t("sync.stateAgo", { state: words, ago }) : words}
      </span>
    </div>
  );
}
