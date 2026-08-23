/**
 * The three channels that reach outside the app: a file, a release page, a
 * privacy policy.
 *
 * Two of them take no argument at all, which is the point. A handler that
 * opened whatever URL the renderer passed would be a way to launch anything the
 * moment a task's text could reach it.
 */

import { ipcMain, shell } from "electron";
import { getWindow } from "../window";
import { revealExport, runExport } from "../export-service";
import { installUpdate } from "../updater";
import { language } from "../i18n";

/** Where the guide tab's link goes. */
const RELEASES_URL = "https://github.com/holdn2/Nekan/releases";

/**
 * The privacy policy, one page per language.
 *
 * A map rather than one URL with the language appended: the set of pages that
 * exist is a fact about the site, not about the language tag, and a missing
 * language should fall back to a page that is really there.
 */
const PRIVACY_URL = {
  ko: "https://holdn2.github.io/Nekan/privacy.html",
  en: "https://holdn2.github.io/Nekan/privacy.en.html",
};

function registerShellIpc() {
  /* ------------------------------------------------------------ export */

  ipcMain.handle("export:run", () => runExport(getWindow()));
  ipcMain.handle("export:reveal", (_e, target) => revealExport(target));

  /* ------------------------------------------------------------ update */

  // Quits the app on the way through, so there is nothing useful to return
  // beyond "there was something to install".
  ipcMain.handle("update:install", () => installUpdate());

  // Takes no argument on purpose. A handler that opened whatever URL the
  // renderer passed would be a way to launch anything the moment a task's text
  // could reach it; this one can only ever open the releases page.
  ipcMain.handle("update:notes", () => shell.openExternal(RELEASES_URL));

  /* ------------------------------------------------------------- legal */

  // Takes no argument for the same reason as update:notes above. The language
  // is read here rather than passed in, so the renderer cannot pick the page
  // either -- there is nothing on this channel for a task's text to steer.
  ipcMain.handle("legal:privacy", () =>
    shell.openExternal(
      (PRIVACY_URL as Record<string, string>)[language()] || PRIVACY_URL.en,
    ),
  );
}

export { registerShellIpc };
