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
import { $, $$ } from "../dom.js";
import { toggleSize } from "./mode.js";
import { TitleBar } from "./chrome/title-bar.js";
import { GuideVersion, Tabs, UpdateLine } from "./chrome/tabs.js";

export {
  getTab,
  getTheme,
  applySpace,
  setTab,
  applyTheme,
  toggleTheme,
  applyPinned,
  applyVersion,
  applyUpdateStatus,
} from "./chrome/state.js";

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
