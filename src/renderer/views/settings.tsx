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
 *
 * settings.css is down to the dot on the gear. What is gone from it and NOT
 * spelled here is the `.settings .account` override: the account block is only
 * ever drawn inside this panel, so a rule painting it as a card and a second
 * rule unpainting it collapsed into the one margin below.
 */

import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { target } from "../dom.js";
import { t } from "../i18n.js";
import { getTheme, toggleTheme } from "../window/chrome.js";
import { closeSettings, isSettingsOpen } from "../panels.js";
import { exportBoard } from "../window/export-ui.js";
import { useRenderSignal } from "../react/use-store.js";
import { cn } from "../react/cn.js";
import { CloseIcon } from "../react/icons.js";
import { Account } from "./account.js";
import { LanguageSelect } from "../components/language-select.js";

/**
 * A row: a label on the left, one control on the right.
 *
 * Three rows share it, so it is a constant rather than three copies of the
 * same eight utilities. The top border is what separates the rows -- there is
 * no divider element, and the account block below carries the same border for
 * the same reason.
 */
const ROW =
  "settings-row flex items-center justify-between gap-xl border-t border-line py-md";

/** The words on the left of a row. */
const LABEL = "settings-label text-sm text-muted";

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
      <header className="settings-head mb-lg flex items-center justify-between">
        <h2 className="m-[0px] text-lg font-semibold">{t("settings.title")}</h2>
        <button
          className={cn(
            "settings-close rounded-sm border-0 bg-transparent px-sm py-2xs",
            "text-2xl leading-none text-muted hover:bg-panel-2 hover:text-text",
          )}
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
      <div className={ROW}>
        {/* A real <label>, not the <span> the other rows use: those sit beside
            a group that carries its own aria-label, but a bare <select> next to
            a <span> has no accessible name at all. */}
        <label className={LABEL} htmlFor="languageSelect">
          {t("settings.language")}
        </label>
        {/* The picker carries its own look -- see components/language-select. */}
        <LanguageSelect id="languageSelect" />
      </div>

      <div className={ROW}>
        <span className={LABEL}>{t("settings.theme")}</span>
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

      <div className={ROW}>
        <span className={LABEL}>{t("settings.export")}</span>
        <button
          className={cn(
            "settings-action inline-flex items-center gap-md rounded-md",
            "border border-line bg-transparent px-lg py-xs text-sm text-text",
            "hover:border-muted",
          )}
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
          {/* The catalogue says "{{mod}}+E" and the interpolation fills the
              modifier in, the same path the guide's own shortcut list takes.
              It was hardcoded "Ctrl+E" here, which read wrong on macOS and,
              being English already, was invisible to find-untranslated. A
              second literal would have re-opened exactly that hole.

              font-[inherit] is the family only, which is all this needs: a
              <kbd> comes out of the UA stylesheet in a monospace face, and the
              size is asked for by name rather than inherited. */}
          <kbd className="font-[inherit] text-xs text-muted">
            {t("settings.exportShortcut")}
          </kbd>
        </button>
      </div>

      {/* Its own block rather than a row: it is the one thing in here with
          more than a control in it -- a state, an address, and two buttons
          that end an account. */}
      <div className="settings-block border-t border-line pt-md">
        <span className={LABEL}>{t("settings.sync")}</span>
        {/* No card of its own. The block came from the guide, where it had one;
            in here the panel is the card, and what used to be two rules
            painting a box and then unpainting it is this one margin. */}
        <section className="account mt-md" id="account">
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
