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
 * rule unpainting it are both gone -- the block is a ui/card now, and a card
 * is one place rather than two rules arguing.
 *
 * The four things in here that used to draw their own chrome no longer do:
 * the rows are divided by ui/separator, the close and export buttons are
 * ui/button, and the account block is ui/card. What is deliberately NOT a
 * ui/button is the theme control -- `.switch` is a two-option segmented pill
 * with a sliding knob, and ui/button has no such variant.
 */

import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { target } from "../dom.js";
import { t } from "../i18n.js";
import { getTheme, toggleTheme } from "../window/chrome.js";
import { closeSettings, isSettingsOpen } from "../panels.js";
import { exportBoard } from "../window/export-ui.js";
import { useRenderSignal } from "../react/use-store.js";
import { CloseIcon } from "../react/icons.js";
import { Account } from "./account.js";
import { LanguageSelect } from "../components/language-select.js";
import { Button } from "../components/ui/button.js";
import { Separator } from "../components/ui/separator.js";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card.js";

/**
 * A row: a label on the left, one control on the right.
 *
 * Three rows share it, so it is a constant rather than three copies of the
 * same eight utilities. What separates the rows is a <Separator> between them
 * rather than a `border-t` on each -- same hairline in the same token, but the
 * divider is now a thing in the markup with `role="none"` on it, so a screen
 * reader is not told about three borders it cannot act on. The paint is
 * identical: Separator is `h-px w-full bg-line`.
 */
const ROW = "settings-row flex items-center justify-between gap-xl py-md";

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
        {/* The ghost variant is the one that has no fill at rest, which is
            what this was already doing by hand. `icon-xs` is a 24px square:
            the hand-written version was about 22x14, so the hit target grew
            and nothing else moved. The cross inside comes out at 12px rather
            than 10 -- ui/button sizes any svg that does not carry a size of
            its own, and that is the primitive deciding, which is the point of
            using it. */}
        <Button
          className="settings-close text-muted"
          variant="ghost"
          size="icon-xs"
          id="settingsClose"
          type="button"
          aria-label={t("settings.close")}
          onClick={closeSettings}
        >
          <CloseIcon />
        </Button>
      </header>

      <Separator />

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

      <Separator />

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

      <Separator />

      <div className={ROW}>
        <span className={LABEL}>{t("settings.export")}</span>
        {/* `outline` is the neutral bordered variant, which is what this row
            already was: a hairline in `line`, no fill of its own worth
            noticing on a panel of the same colour. `sm` keeps the 28px height
            the hand-written padding produced; the text size is asked for back,
            because ui/button's `sm` carries `text-xs` and this row is
            `text-sm`, the same 12px as the label facing it. (This app's scale
            is xs 11 / sm 12 / md 13 / lg 14 / xl 16 -- not Tailwind's, which
            is why a size has to be read as a rung rather than as a number.) */}
        <Button
          className="settings-action text-sm"
          variant="outline"
          size="sm"
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
        </Button>
      </div>

      {/* Its own block rather than a row: it is the one thing in here with
          more than a control in it -- a state, an address, and two buttons
          that end an account.

          A card rather than another `border-t`, and the difference is only a
          hairline: ui/card paints `bg-panel` on a panel that is already
          `bg-panel`, so all that shows is its `ring-1 ring-line` -- the same
          token the border was, closed into a box. That is what the block
          wanted. The old note here said the panel was the card and this
          should not have one; that was true while the alternative was a
          second painted surface, and it is not what a ring costs.

          `size="sm"` because the panel is 320px wide: the default's 16px
          padding on top of the panel's own 16px would leave the account block
          256px to lay out an address, a state and two buttons in. */}
      <Card className="settings-block mt-lg" size="sm">
        <CardHeader>
          <CardTitle className={LABEL}>{t("settings.sync")}</CardTitle>
        </CardHeader>
        <CardContent>
          <section className="account" id="account">
            <Account />
          </section>
        </CardContent>
      </Card>
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
