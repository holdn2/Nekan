/**
 * Export, as a share sheet rather than a save dialog.
 *
 * A phone has no place to "save a file to" that means anything to the person
 * holding it. What it has is a sheet that already knows where their documents,
 * their mail and their notes app are -- so the app writes the file and hands
 * it over, and the destination is somebody else's problem, correctly.
 *
 * The document itself is `shared/export`, the same code the desktop prints
 * from. That matters more than it looks: the labels, the ordering, the due
 * dates and the board's name are all resolved into the snapshot, so a file
 * exported from a phone and one exported from a laptop are the same document
 * rather than two that happen to look alike.
 *
 * PDF goes through HTML here as it does there. The desktop prints in a hidden
 * window; `expo-print` renders the same markup. One thing is deliberately not
 * carried over: the desktop embeds its typeface into the PDF with a `file://`
 * URL, which it can do because that PDF is a temporary file on that machine.
 * Nothing here does that -- the file is about to be handed to whoever the
 * person picks, and a path into this phone's sandbox would be a dead link in
 * somebody else's copy.
 */
import { Directory, File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import {
  buildSnapshot,
  defaultFileName,
  toHtml,
  toMarkdown,
} from "@nekan/shared/export";
import { locale, t } from "./i18n";
import { allTasks, currentSpace, now } from "./store/state";

export type Format = "pdf" | "html" | "md";

const MIME: Record<Format, string> = {
  pdf: "application/pdf",
  html: "text/html",
  md: "text/markdown",
};

/**
 * A fresh handle every time, never a module constant.
 *
 * `move()` rewrites the URI of the object it is called on, and the same care
 * that `store/persist.ts` takes applies to anything holding a File.
 */
function target(name: string) {
  const dir = new Directory(Paths.cache, "export");
  dir.create({ intermediates: true, idempotent: true });
  return new File(dir, name);
}

/**
 * Build the document and offer it.
 *
 * Returns false when the platform has no share sheet, which is the one case
 * worth telling the caller about -- everything else either works or throws.
 */
export async function exportBoard(format: Format): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;

  const when = new Date(now());
  const snapshot = buildSnapshot(allTasks(), when, currentSpace(), {
    t,
    locale: locale(),
  });
  const name = defaultFileName(when, format, currentSpace(), t);

  let uri: string;
  if (format === "pdf") {
    // expo-print names the file itself, so it is moved to the name the rest
    // of the app agreed on -- the share sheet shows that name to the person.
    const printed = await Print.printToFileAsync({ html: toHtml(snapshot) });
    const file = new File(printed.uri);
    const dest = target(name);
    if (dest.exists) dest.delete();
    file.move(dest);
    uri = target(name).uri;
  } else {
    const file = target(name);
    file.create({ overwrite: true });
    file.write(format === "html" ? toHtml(snapshot) : toMarkdown(snapshot));
    uri = file.uri;
  }

  await Sharing.shareAsync(uri, {
    mimeType: MIME[format],
    UTI: format === "pdf" ? "com.adobe.pdf" : "public.plain-text",
    dialogTitle: t("settings.export"),
  });
  return true;
}
