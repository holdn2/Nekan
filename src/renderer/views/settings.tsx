/**
 * The settings popover behind the gear.
 *
 * It holds the things that are decided once rather than used constantly --
 * theme, export, account -- which is why they left the title bar. Two buttons
 * became one, and the bar got a button's width back.
 *
 * The whole inside of the popover is drawn here, the account block included.
 * The <section> itself stays index.html's -- it is positioned against the
 * window rather than against anything drawn in it, and its aria-label is a
 * static string the catalogue reaches through data-i18n.
 *
 * Whether it is open lives in panels.ts, not here. The gear that opens it is
 * drawn by the title bar, and app.ts closes it on the way into a bar -- a view
 * cannot own a state whose button is outside it.
 */

import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { target } from "../dom.js";
import { t } from "../i18n.js";
import { accelName } from "../keys.js";
import { getTheme, toggleTheme } from "../window/chrome.js";
import { closeSettings, isSettingsOpen } from "../panels.js";
import { exportBoard } from "../window/export-ui.js";
import { useRenderSignal } from "../react/use-store.js";
import { CloseIcon } from "../react/icons.js";
import { Account } from "./account.js";
import { LanguageSelect } from "../components/language-select.js";

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
        <LanguageSelect className="settings-select" id="languageSelect" />
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
          {/* Not a catalogue string: there is no sentence here, only the name
              of a key, and that name is decided by the OS rather than by the
              language. It was hardcoded "Ctrl+E" and so read wrong on macOS --
              and being English already, find-untranslated never saw it. */}
          <kbd>{accelName()}+E</kbd>
        </button>
      </div>

      {/* Its own block rather than a row: it is the one thing in here with
          more than a control in it -- a state, an address, and two buttons
          that end an account. */}
      <div className="settings-block">
        <span className="settings-label">{t("settings.sync")}</span>
        <section className="account" id="account">
          <Account />
        </section>
      </div>
    </>
  );
}

/**
 * Fill the panel, and bind the two ways out that are not buttons in it: the
 * backdrop, and Escape.
 */
export function mountSettings() {
  const panel = document.getElementById("settingsPanel");
  if (panel) createRoot(panel).render(<SettingsBody />);

  document
    .getElementById("settingsBackdrop")
    ?.addEventListener("click", closeSettings);

  // Escape closes it. Registered here rather than in app.js's shortcut handler
  // because that one only listens for Ctrl combinations.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSettings();
  });
}
