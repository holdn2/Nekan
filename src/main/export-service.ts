/**
 * Writing the board out as PDF, HTML or Markdown.
 *
 * The document is built here, in main, from `store.tasks` — every renderer
 * change goes through `state:save`, so that array is already what is on screen
 * and there is nothing to ask the renderer for.
 *
 * The format is decided by the extension the user picks in the native save
 * dialog, which makes the dialog's file-type dropdown the whole format picker.
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { BrowserWindow, app, dialog, shell } from "electron";

import { sanitizeSpace } from "../shared/core";
import {
  buildSnapshot,
  defaultFileName,
  toHtml,
  toMarkdown,
} from "../shared/export";
import { getSettings, getStore } from "./store";
import { language, t } from "./i18n";

/** Rebuilt per export: the dropdown is written when the dialog opens, and the
 *  language can have changed since the last one. */
const exportFilters = () => [
  { name: t("export.filterPdf"), extensions: ["pdf"] },
  { name: t("export.filterHtml"), extensions: ["html"] },
  { name: t("export.filterMarkdown"), extensions: ["md"] },
];

/**
 * The app's own copy of Pretendard, as a URL the print window can fetch.
 *
 * Only the PDF gets this. It is an absolute path into wherever Nekan happens
 * to be installed -- inside app.asar in a packaged build -- so it is right for
 * the throwaway file we print and delete, and wrong for anything the user
 * keeps. See the note on toHtml.
 */
const fontUrl = () =>
  pathToFileURL(
    path.join(
      __dirname,
      "..",
      "renderer",
      "assets",
      "PretendardVariable.woff2",
    ),
  ).href;

/**
 * Print the export page in a throwaway window. It has to be a real window with
 * a real load: `printToPDF` runs on a webContents, and borrowing the app's own
 * would flash the document over the matrix. The HTML goes through a temp file
 * rather than a data: URL so a long board cannot hit a URL length limit.
 */
async function renderPdf(html, target) {
  const tmp = path.join(app.getPath("temp"), `em-export-${Date.now()}.html`);
  fs.writeFileSync(tmp, html, "utf8");

  const printer = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  try {
    await printer.loadFile(tmp);
    const pdf = await printer.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      landscape: true,
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
    });
    fs.writeFileSync(target, pdf);
  } finally {
    if (!printer.isDestroyed()) printer.destroy();
    fs.rmSync(tmp, { force: true });
  }
}

/**
 * Ask where to save, then write it. Returns a small result the renderer turns
 * into a toast: ok / empty / canceled / error.
 *
 * What comes out follows the header toggle — the matrix on screen plus the
 * shared inbox. The other board is a separate export.
 */
async function runExport(parent) {
  if (!parent || parent.isDestroyed()) return { ok: false, reason: "canceled" };

  const space = sanitizeSpace(getSettings().activeSpace);
  const i18n = { t, locale: language() };
  const snapshot = buildSnapshot(getStore().tasks, new Date(), space, i18n);
  if (!snapshot.total) return { ok: false, reason: "empty" };

  const picked = await dialog.showSaveDialog(parent, {
    title: t("export.title", { space: t(`space.${space}`) }),
    defaultPath: path.join(
      app.getPath("documents"),
      defaultFileName(new Date(), "pdf", space, t),
    ),
    filters: exportFilters(),
  });
  if (picked.canceled || !picked.filePath) {
    return { ok: false, reason: "canceled" };
  }

  const target = picked.filePath;
  try {
    const ext = path.extname(target).toLowerCase();
    if (ext === ".md" || ext === ".markdown") {
      fs.writeFileSync(target, toMarkdown(snapshot), "utf8");
    } else if (ext === ".html" || ext === ".htm") {
      fs.writeFileSync(target, toHtml(snapshot), "utf8");
    } else {
      // Anything else (including a name typed without an extension, which the
      // dialog completes to .pdf) goes through the printer.
      await renderPdf(toHtml(snapshot, { fontUrl: fontUrl() }), target);
    }
  } catch (err) {
    console.error("export failed", err);
    return { ok: false, reason: "error", message: String(err.message || err) };
  }

  return { ok: true, path: target, name: path.basename(target) };
}

/** Show the written file in Explorer — the toast's "Open the folder". */
function revealExport(target) {
  if (typeof target === "string" && target) shell.showItemInFolder(target);
}

export { runExport, revealExport };
