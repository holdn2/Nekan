/**
 * What the title bar and the tab strip are showing, and the pushes that change
 * it.
 *
 * Half of this is main's to decide and only ever arrives as a push -- pinned,
 * the update status, the version. A component cannot derive any of it, so it
 * is held here and read during render; that is also what makes a language
 * change re-word it, since notify() reaches every subscriber.
 *
 * Which tab is open lives here rather than in a view because the buttons are
 * in the title bar and the panels are not.
 */

import { t } from "../../i18n.js";
import { notify } from "../../render-bus.js";
import { toast } from "../../components/toast.js";
import { setSpace } from "../../store.js";
import { setSelected } from "../../selection.js";
import { resetArchivePaging } from "../../views/archive.js";

type UpdateStatus = Parameters<
  Parameters<typeof window.api.onUpdateStatus>[0]
>[0];

let activeTab = "matrix";
let theme = "light";
/** The version already announced, so the toast fires once per download. */
let announced: string | null = null;
/** Last values pushed in, kept so a redraw can say them again. */
let pinned = true;
let updateStatus: UpdateStatus | null = null;
let version = "";

/** 'matrix' | 'history' | 'trash' | 'guide'. */
export const getTab = () => activeTab;
/** Which palette is on. The settings panel draws its segment from this. */
export const getTheme = () => theme;

/* ------------------------------------------------------------------ boards */

/** Switch boards. `persist` is false while replaying the saved choice. */
export function applySpace(next: unknown, persist = true) {
  const space = setSpace(next);
  if (persist) window.api.setSpace(space);
  notify();
}

/* -------------------------------------------------------------------- tabs */

/**
 * Move to a tab. Which section is on screen follows from this, in tabs.tsx.
 *
 * Hiding the four sections used to be five classList.toggle calls right here,
 * which meant a second way of changing tabs would have had to remember them.
 * They are an effect of the component that draws the tab strip now: it reads
 * the same answer these buttons write, so the two cannot disagree.
 */
export function setTab(tab: string) {
  // The panel belongs to the matrix; leaving the tab closes it (and gives the
  // window its height back) rather than leaving it pointing at a hidden row.
  if (tab !== "matrix") setSelected(null);
  // A list someone expanded with 더 보기 goes back to one page. Leaving it open
  // makes every later redraw pay for a choice made once and forgotten.
  resetArchivePaging();
  activeTab = tab;
  notify();
}

/* ------------------------------------------------------------ theme / pin */

/** Swap the palette. The stylesheet keys off data-theme on <html>. */
export function applyTheme(next: string, persist = true) {
  theme = next === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  notify();
  if (persist) window.api.setTheme(theme);
}

/** Ctrl+D and the settings panel both come through here. */
export function toggleTheme() {
  applyTheme(theme === "dark" ? "light" : "dark");
}

/** Reflect the always-on-top state main.js reports back. */
export function applyPinned(on: boolean) {
  pinned = on;
  notify();
}

/* ----------------------------------------------------------------- update */

/** Show the running version. It cannot change while the app is open. */
export function applyVersion(next: string | null) {
  version = next || "";
  notify();
}

/**
 * What the guide tab says about updates, in the caller's own words.
 *
 * `announce` splits news from state, and only news is worth interrupting for. A
 * pushed status is news: something finished downloading just now. The one that
 * comes back with state:load is not — it is how things already were, and the
 * renderer asking for it has either just started or just reloaded. The button
 * belongs to both; the toast belongs only to the first.
 */
export function applyUpdateStatus(
  status: UpdateStatus | null,
  { announce = false } = {},
) {
  updateStatus = status;
  notify();

  if (status?.state !== "ready") return;
  if (!announce || announced === status?.version) return;
  announced = status?.version ?? null;

  // Both strings put the version somewhere a Korean particle never follows it:
  // the one that would (…1.0.1'은' / …1.0.2'는') depends on how the last digit
  // is read aloud, and no single wording is right for every release. The space
  // travels with the number so the sentence closes up when there is none.
  const shown = status.version ? ` ${status.version}` : "";
  // No toast in a bar — collapsed.css hides it — but the button is there, and
  // the update lands on the next quit regardless.
  toast(t("update.toast", { version: shown }), {
    ms: 10000,
    action: {
      label: t("update.restart"),
      onClick: () => window.api.installUpdate(),
    },
  });
}

/** What the guide tab's line says, for each state main can report. */
const UPDATE_TEXT: Record<string, string> = {
  checking: "update.checking",
  latest: "update.latest",
  downloading: "update.downloading",
  ready: "update.ready",
  error: "update.error",
};

export type { UpdateStatus };
/**
 * Reads for the components. Functions rather than exported bindings: a value
 * captured at import time would be the one main sent before the window
 * existed, which for three of these is null.
 */
const currentUpdate = () => updateStatus;
const currentVersion = () => version;
const isPinned = () => pinned;

export { currentUpdate, currentVersion, isPinned, UPDATE_TEXT };
