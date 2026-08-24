/**
 * The settings popover behind the gear.
 *
 * It holds the things that are decided once rather than used constantly --
 * theme, export, account -- which is why they left the title bar. Two buttons
 * became one, and the bar got a button's width back.
 *
 * React fills the top of the panel and the account block fills the rest, each
 * into its own host: the panel itself is index.html's, because the popover is
 * positioned against the window rather than against anything either of them
 * draws.
 *
 * Whether it is open lives in panels.ts, not here. The gear that opens it is
 * drawn by the title bar, and app.ts closes it on the way into a bar -- a view
 * cannot own a state whose button is outside it.
 */

import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { target } from "../dom.js";
import { t, wireLanguageSelect } from "../i18n.js";
import { getTheme, toggleTheme } from "../window/chrome.js";
import { closeSettings, isSettingsOpen } from "../panels.js";
import { exportBoard } from "../window/export-ui.js";
import { useRenderSignal } from "../react/use-store.js";
import { CloseIcon } from "../react/icons.js";

function SettingsBody() {
  useRenderSignal();
  const open = isSettingsOpen();

  // The panel and its backdrop are index.html's -- the popover is positioned
  // against the window rather than against anything this draws.
  useEffect(() => {
    document.getElementById("settingsPanel")?.classList.toggle("hidden", !open);
    document
      .getElementById("settingsBackdrop")
      ?.classList.toggle("hidden", !open);
  });

  const theme = getTheme();
  const select = useRef<HTMLSelectElement>(null);

  // Filled and wired by i18n, which owns the list and keeps every picker on
  // screen in step -- the first-run card carries one too. Once, on mount: the
  // element is React's but its options are not.
  useEffect(() => {
    if (select.current) wireLanguageSelect(select.current);
  }, []);

  return (
    <>
      <header className="settings-head">
        <h2>{t("settings.title")}</h2>
        <button
          className="settings-close"
          id="settingsClose"
          type="button"
          aria-label={t("settings.close")}
          onClick={closeSettings}
        >
          <CloseIcon />
        </button>
      </header>

      {/* A select, not the .switch the theme row uses. That pill is
          `width: calc(50% - 2px)` and `translateX(100%)`, so it is only ever
          right for exactly two options — reusing it here would break on the
          day a third language lands, which is the whole point of this row. */}
      <div className="settings-row">
        {/* A real <label>, not the <span> the other rows use: those sit beside
            a group that carries its own aria-label, but a bare <select> next to
            a <span> has no accessible name at all. */}
        <label className="settings-label" htmlFor="languageSelect">
          {t("settings.language")}
        </label>
        <select className="settings-select" id="languageSelect" ref={select} />
      </div>

      <div className="settings-row">
        <span className="settings-label">{t("settings.theme")}</span>
        <div
          className="switch"
          id="themeSeg"
          role="group"
          aria-label={t("settings.themeChoose")}
          onClick={(e) => {
            const btn = target(e.nativeEvent).closest<HTMLElement>(
              ".switch-btn",
            );
            // Both halves are always on screen, so a click means "make it this
            // one" rather than "flip" -- pressing the active one is not a
            // request.
            if (!btn || btn.classList.contains("active")) return;
            toggleTheme();
          }}
        >
          <button
            className={`switch-btn${theme === "light" ? " active" : ""}`}
            data-theme="light"
            type="button"
            aria-pressed={theme === "light"}
          >
            {t("settings.themeLight")}
          </button>
          <button
            className={`switch-btn${theme === "dark" ? " active" : ""}`}
            data-theme="dark"
            type="button"
            aria-pressed={theme === "dark"}
          >
            {t("settings.themeDark")}
          </button>
        </div>
      </div>

      <div className="settings-row">
        <span className="settings-label">{t("settings.export")}</span>
        <button
          className="settings-action"
          id="settingsExport"
          type="button"
          onClick={() => {
            // The save dialog is a window of its own; leaving the popover open
            // behind it would put a stale panel over the board when it closes.
            closeSettings();
            exportBoard();
          }}
        >
          PDF · HTML · Markdown
          <kbd>Ctrl+E</kbd>
        </button>
      </div>
    </>
  );
}

/**
 * Fill the top of the panel, and bind the two ways out that are not buttons in
 * it: the backdrop, and Escape.
 */
export function mountSettings() {
  const body = document.getElementById("settingsBody");
  if (body) createRoot(body).render(<SettingsBody />);

  document
    .getElementById("settingsBackdrop")
    ?.addEventListener("click", closeSettings);

  // Escape closes it. Registered here rather than in app.js's shortcut handler
  // because that one only listens for Ctrl combinations.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSettings();
  });
}
