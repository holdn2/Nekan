/**
 * The Export button.
 *
 * There is nothing to collect here: the document is built in the main process
 * from the task list that was last saved, and every renderer change goes
 * through the store's save. So this file is the click, the disabled flag that
 * keeps a second dialog from opening, and the toast that says where the file
 * went — the format itself is decided by the extension in the native dialog.
 */

import { t } from "../i18n.js";
import { toast } from "../components/toast.js";

/**
 * Whether a save dialog is already open.
 *
 * This used to be the title-bar button's own `disabled` flag, which broke the
 * moment that button moved into the settings panel: the element was gone and
 * reading `.disabled` off null threw before the export ever started. A module
 * flag does not care where the click came from.
 */
let busy = false;

/** Run one export round trip. Safe to call from the panel or Ctrl+E. */
export async function exportBoard() {
  if (busy) return;
  busy = true;
  try {
    const res = await window.api.exportBoard();
    if (res?.ok) {
      toast(t("export.saved", { name: res.name }), {
        action: {
          label: t("export.openFolder"),
          onClick: () => window.api.revealExport(res.path),
        },
      });
    } else if (res?.reason === "empty") {
      toast(t("export.nothing"));
    } else if (res?.reason === "error") {
      toast(t("export.failedWith", { message: res.message }), {
        error: true,
        ms: 6000,
      });
    }
    // 'canceled' is the user closing the dialog — no message for that.
  } catch (err) {
    // main answers failures inside the result object, so reaching here means
    // the IPC round trip itself broke. Without this the user would watch the
    // dialog close and never learn that nothing was written.
    console.error("export failed", err);
    toast(t("export.failed"), { error: true, ms: 6000 });
  } finally {
    busy = false;
  }
}
