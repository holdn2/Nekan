/**
 * The shape of a finished document, before anybody writes it out.
 *
 * Every word the formatters will need is in here. There is no catalogue in
 * shared/ -- i18next is initialised once by main and once by the renderer, and
 * neither of them is this file -- so buildSnapshot() is handed a `t`, resolves
 * the lot, and writes the words into the snapshot. A printed page cannot look
 * a word up again later, which is the same reason a due date is resolved up
 * front rather than recomputed.
 */

import type { Place, Space } from "../types.js";

/**
 * The catalogue, as this file is allowed to see it.
 *
 * There is no i18next in here and there is not going to be. buildSnapshot is
 * handed `t` and a locale, resolves every string it needs, and writes them into
 * the snapshot; the two formatters below read that object and nothing else. A
 * printed page cannot look a word up again later, so the document has to carry
 * its own words -- which is the same reason the due date is resolved up front.
 */
export interface I18n {
  t: (key: string, vars?: Record<string, unknown>) => string;
  locale: string;
}

/** A due date as a document shows it: resolved, never recomputed. */
export interface ItemDue {
  text: string;
  hint: string;
  state: string;
  /** The two run into one sentence for markdown; HTML sets them apart. */
  line: string;
}

/** One task, reduced to what a document needs. */
export interface ExportItem {
  text: string;
  due: ItemDue | null;
  memo: string | null;
}

/** One quadrant, or the dump, as it reaches the page. */
export interface ExportSection {
  key: Place;
  title: string;
  action: string;
  items: ExportItem[];
  /** What the quadrant really holds, which is not what is on the page. */
  count: number;
  hidden: number;
  more: string;
}

/** Every string the formatters need, resolved once at the top. */
export interface ExportLabels {
  meta: string;
  metaShort: string;
  empty: string;
  limit: string;
}

/** The finished document, before it is written as HTML, PDF or markdown. */
export interface Snapshot {
  stamp: string;
  space: Space;
  spaceLabel: string;
  total: number;
  truncated: boolean;
  perSection: number;
  inbox: ExportSection;
  quads: ExportSection[];
  sections: ExportSection[];
  lang: string;
  labels: ExportLabels;
}
