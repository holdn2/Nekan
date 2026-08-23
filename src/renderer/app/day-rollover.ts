/**
 * Redraw when the day changes underneath the app.
 *
 * Every due date on screen is worded relative to today, so a widget left open
 * overnight is quietly wrong by morning. A timer covers the machine staying
 * awake; the focus and visibility checks cover it having been asleep, where
 * the timer never fired at all.
 */

import { startOfToday, startOfTomorrow } from "../../shared/core.js";
import { notify } from "../render-bus.js";

/**
 * Every due-date label is relative to *today*, but this widget is meant to sit
 * on screen for days. Without a rollover, an item added yesterday keeps its
 * orange "today" chip until some unrelated click happens to re-render.
 */
let dayTimer: ReturnType<typeof setTimeout> | null = null;
let renderedDay = startOfToday().getTime();

/** Redraw only if the date actually moved on. */
function refreshIfDayChanged() {
  const today = startOfToday().getTime();
  if (today === renderedDay) return;
  renderedDay = today;
  notify();
}

/** Re-arm for the next local midnight, and keep re-arming after that. */
function scheduleDayRollover() {
  if (dayTimer) clearTimeout(dayTimer);
  // +1s of slack so a timer that fires a hair early doesn't re-render the
  // day that is still ending and then wait another 24h.
  const wait = startOfTomorrow().getTime() - Date.now() + 1000;
  dayTimer = setTimeout(
    () => {
      refreshIfDayChanged();
      scheduleDayRollover();
    },
    Math.max(1000, wait),
  );
}

/**
 * The two crossings a timer cannot see: waking from sleep, and coming back to
 * a window that was in the background while midnight went past.
 */
function watchForDayChange() {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshIfDayChanged();
  });
  window.addEventListener("focus", refreshIfDayChanged);
}

export { refreshIfDayChanged, scheduleDayRollover, watchForDayChange };
