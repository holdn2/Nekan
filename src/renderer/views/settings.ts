/**
 * The settings popover behind the gear.
 *
 * It holds the things that are decided once rather than used constantly --
 * theme, export, account -- which is why they left the title bar. Two buttons
 * became one, and the bar got a button's width back.
 *
 * The account half is not here: views/account.js still owns that markup, which
 * only moved house. This file is the panel around it.
 */

import { $, target } from "../dom.js";
import { wireLanguageSelect } from "../i18n.js";
import { getMode, toggleTheme } from "../window/chrome.js";
import { exportBoard } from "../window/export-ui.js";

let open = false;
/** The settings panel's elements, by the id each one has in index.html. */
interface SettingsEls {
  panel: HTMLElement;
  backdrop: HTMLElement;
  gear: HTMLButtonElement;
}

// Looked up once and kept, because a push from main can arrive before the
// wiring has run. Named rather than a bag of HTMLElement, because a handful of
// these are form controls and the code reads `value`, `checked` and `disabled`
// off exactly those.
const els = {} as SettingsEls;

export function isSettingsOpen() {
  return open;
}

export function closeSettings() {
  if (!open) return;
  open = false;
  els.panel.classList.add("hidden");
  els.backdrop.classList.add("hidden");
  els.gear.setAttribute("aria-expanded", "false");
}

/**
 * Show the panel, growing the window first if this is a bar.
 *
 * 320px of panel does not fit in 48px of height, and a popover that opened
 * half off-screen would be worse than one that took a moment. The window is
 * main's to resize, so this asks and then opens regardless -- a failed expand
 * should not swallow the click.
 */
export async function openSettings() {
  if (open) return;
  if (getMode() === "collapsed") {
    try {
      await window.api.expand();
    } catch (err) {
      console.error("expand failed", err);
    }
  }
  open = true;
  els.panel.classList.remove("hidden");
  els.backdrop.classList.remove("hidden");
  els.gear.setAttribute("aria-expanded", "true");
}

export function wireSettings() {
  els.panel = $("#settingsPanel");
  els.backdrop = $("#settingsBackdrop");
  els.gear = $("#settingsBtn");

  els.gear.addEventListener("click", () => {
    if (open) closeSettings();
    else openSettings();
  });

  els.backdrop.addEventListener("click", closeSettings);
  $("#settingsClose").addEventListener("click", closeSettings);

  // Escape closes it. Registered here rather than in app.js's shortcut handler
  // because that one only listens for Ctrl combinations.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) closeSettings();
  });

  // Built rather than written into index.html, and shared with the first-run
  // card — see wireLanguageSelect for why both screens carry one.
  wireLanguageSelect($("#languageSelect"));

  $("#themeSeg").addEventListener("click", (e) => {
    const btn = target(e).closest<HTMLElement>(".switch-btn");
    // Both halves are always on screen, so a click means "make it this one"
    // rather than "flip" -- pressing the active one is not a request.
    if (!btn || btn.classList.contains("active")) return;
    toggleTheme();
  });

  $("#settingsExport").addEventListener("click", () => {
    // The save dialog is a window of its own; leaving the popover open behind
    // it would put a stale panel over the board when it closes.
    closeSettings();
    exportBoard();
  });
}
