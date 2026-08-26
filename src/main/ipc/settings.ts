/**
 * Everything the user can change and expect to find again next time.
 *
 * Each handler validates what came over the wire before it is stored --
 * a layout, a board or a startup choice that arrived wrong would come back out
 * of data.json on every launch from then on.
 */

import { ipcMain } from "electron";
import { sanitizeLayout, sanitizeSpace } from "../../shared/core";
import { getSettings, persist, persistNow } from "../store";
import { getWindow } from "../window";
import { storedLanguage } from "../../shared/i18n/locales";
import { PALETTE } from "../../shared/theme";
import { setMainLanguage } from "../i18n";

function registerSettingsIpc() {
  /* ---------------------------------------------------------- settings */

  // Persisted, and main's own copy follows. No restart and no window rebuild:
  // the argv hand-off exists for the first paint only, and after that i18next
  // can swap catalogues in place on both sides.
  ipcMain.handle("settings:language", (_e, next) => {
    const settings = getSettings();
    settings.language = storedLanguage(next) || settings.language;
    setMainLanguage(settings.language as string);
    persist();
    return settings.language;
  });

  ipcMain.handle("settings:theme", (_e, theme) => {
    const settings = getSettings();
    settings.theme = theme === "dark" ? "dark" : "light";
    const win = getWindow();
    if (win) {
      // The same value create.ts opens with, from the same place. A literal
      // here is a copy that goes stale silently: nothing draws it except a
      // resize, so a wrong one can sit unnoticed for a long time.
      win.setBackgroundColor(
        PALETTE[settings.theme === "dark" ? "dark" : "light"].bg,
      );
    }
    persist();
    return settings.theme;
  });

  ipcMain.handle("settings:layout", (_e, layout) => {
    // Same clamp as the renderer's — both sides call the shared helper so the
    // bounds cannot drift apart.
    const next = sanitizeLayout(layout);
    getSettings().layout = next;
    persist();
    return next;
  });

  // Unlike the memo panel, the inbox takes its height from the matrix instead
  // of growing the window, so there is nothing to resize here — only the fold
  // state to remember.
  ipcMain.handle("settings:inbox", (_e, open) => {
    const settings = getSettings();
    settings.inboxOpen = !!open;
    persist();
    return settings.inboxOpen;
  });

  // Which matrix the header toggle is showing. Nothing moves in the store:
  // every task carries its own `space`, so switching boards is purely a filter
  // in the renderer and only the choice has to survive a restart.
  ipcMain.handle("settings:space", (_e, space) => {
    const settings = getSettings();
    settings.activeSpace = sanitizeSpace(space);
    persist();
    return settings.activeSpace;
  });

  // "sync" or "local", answered once on the first run. Anything else is
  // treated as still-unanswered so a bad value cannot lock the screen away.
  ipcMain.handle("settings:startup", (_e, choice) => {
    const settings = getSettings();
    settings.startupChoice =
      choice === "sync" || choice === "local" ? choice : null;
    // Written now rather than on the debounce, and the write's own answer is
    // returned: the welcome screen holds itself open until this says the
    // choice is on disk, because a screen that closes on an unsaved answer
    // comes back on the next launch having apparently forgotten it.
    const saved = persistNow();
    return saved ? settings.startupChoice : null;
  });
}

export { registerSettingsIpc };
