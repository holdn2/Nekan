/**
 * The snapshot as HTML -- which is also the PDF.
 *
 * main prints this same document in a hidden window, so the two formats cannot
 * drift. The one thing that differs is the font: a PDF is a temp file and may
 * point at the app's own woff2 over file://, while a saved .html travels to
 * other machines where that path is a dead link with somebody's home directory
 * written into it.
 */

import type {
  ExportItem,
  ExportLabels,
  ExportSection,
  Snapshot,
} from "./types.js";

/** Print colours, matching the light palette in styles.css. */
const QUAD_COLOR = {
  inbox: "#8d887d",
  q1: "#c85a4d",
  q2: "#4a72b8",
  q3: "#c1892c",
  q4: "#8d887d",
};

export const escapeHtml = (text: unknown) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** One row: title, optional due chip, optional memo paragraph. */
function htmlItem(item: ExportItem): string {
  const parts = [`<span class="t">${escapeHtml(item.text)}</span>`];
  if (item.due) {
    parts.push(
      `<span class="due ${item.due.state}">${escapeHtml(item.due.text)}` +
        ` · ${escapeHtml(item.due.hint)}</span>`,
    );
  }
  const memo = item.memo
    ? `<p class="memo">${escapeHtml(item.memo).replace(/\r?\n/g, "<br>")}</p>`
    : "";
  return `<li><div class="row">${parts.join("")}</div>${memo}</li>`;
}

/** One quadrant card: coloured header, count, and the list (or "Empty"). */
function htmlSection(
  section: ExportSection,
  tag: string,
  labels: ExportLabels,
): string {
  const body = section.items.length
    ? `<ol>${section.items.map(htmlItem).join("")}</ol>`
    : `<p class="empty">${escapeHtml(labels.empty)}</p>`;
  return (
    `<section class="${tag} ${section.key}">` +
    "<header>" +
    `<span class="dot"></span>` +
    `<h2>${escapeHtml(section.title)}</h2>` +
    `<span class="act">${escapeHtml(section.action)}</span>` +
    `<span class="n">${section.count}</span>` +
    "</header>" +
    body +
    (section.more ? `<p class="more">${escapeHtml(section.more)}</p>` : "") +
    "</section>"
  );
}

/**
 * A standalone page: no external CSS or scripts, because it is opened straight
 * from disk. Always the light palette — the dark theme would print as a black
 * rectangle.
 *
 * `fontUrl` is the one thing that can come from outside, and only the PDF
 * path passes it. The saved .html has to stay portable — a URL into this
 * machine's install would be a broken link on anyone else's computer, and it
 * would write the user's home directory into a file they may hand to someone.
 * The PDF is printed from a temp file that is deleted straight after, so there
 * it can point at the app's own copy and the document comes out in the same
 * typeface as the window it was exported from. Without it the stack below
 * still asks for an installed Pretendard before falling back.
 */
export function toHtml(
  snapshot: Snapshot,
  { fontUrl }: { fontUrl?: string } = {},
): string {
  // Measured 2026-08-18: a file:// face does load in the printToPDF window
  // even though the page itself lives in another directory, and the glyphs are
  // embedded in the PDF. Fonts are a CORS-checked subresource, so this was
  // worth proving rather than assuming.
  const face = fontUrl
    ? `@font-face{font-family:"Pretendard Variable";src:url("${fontUrl}") format("woff2");font-weight:100 900;font-display:block}`
    : "";
  const dots = Object.entries(QUAD_COLOR)
    .map(([key, color]) => `.${key} .dot{background:${color}}`)
    .join("");

  return `<!doctype html>
<html lang="${escapeHtml(snapshot.lang)}">
<head>
<meta charset="UTF-8">
<title>Nekan ${escapeHtml(snapshot.spaceLabel)} ${escapeHtml(snapshot.stamp)}</title>
<style>
  ${face}
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 18px 20px 24px;
    font-family: "Pretendard Variable", "Pretendard", "Apple SD Gothic Neo",
      "Malgun Gothic", -apple-system, "Segoe UI", system-ui, sans-serif;
    font-size: 11.5px; line-height: 1.5; color: #1f1e1c; background: #fff;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .head { display: flex; align-items: baseline; gap: 10px;
    border-bottom: 2px solid #1f1e1c; padding-bottom: 8px; margin-bottom: 14px; }
  .head h1 { font-size: 17px; margin: 0; letter-spacing: .2px; }
  .head .board { font-size: 12px; color: #6f6b61; border: 1px solid #d3cebe;
    border-radius: 99px; padding: 1px 8px; }
  .head .meta { margin-left: auto; color: #6f6b61; font-size: 11px; }
  section { border: 1px solid #d3cebe; border-radius: 8px; padding: 9px 12px 11px;
    break-inside: avoid; }
  section header { display: flex; align-items: center; gap: 7px;
    border-bottom: 1px solid #e2ded1; padding-bottom: 6px; margin-bottom: 7px; }
  section h2 { font-size: 12.5px; margin: 0; }
  .dot { width: 9px; height: 9px; border-radius: 99px; flex: 0 0 auto; }
  .act { color: #6f6b61; font-size: 10.5px; }
  .n { margin-left: auto; color: #6f6b61; font-variant-numeric: tabular-nums; }
  ol { margin: 0; padding-left: 20px; }
  li { margin: 0 0 3px; break-inside: avoid; }
  .row { display: flex; align-items: baseline; gap: 7px; }
  .t { flex: 1 1 auto; }
  .due { flex: 0 0 auto; font-size: 10px; padding: 0 5px; border-radius: 99px;
    border: 1px solid #d3cebe; color: #6f6b61; white-space: nowrap; }
  .due.overdue { color: #b4453c; border-color: #b4453c; }
  .due.today { color: #c05621; border-color: #c05621; }
  .due.soon { color: #8a6a1f; border-color: #c1892c; }
  .memo { margin: 2px 0 5px; padding-left: 8px; border-left: 2px solid #e2ded1;
    color: #6f6b61; font-size: 10.5px; white-space: pre-wrap; }
  .empty { margin: 2px 0; color: #a29d90; }
  .more { margin: 4px 0 0; color: #a29d90; font-size: 10px; }
  .inbox { margin-bottom: 12px; background: #faf9f5; }
  /* The rows get a floor so a short board still prints as a 2x2 matrix instead
     of four boxes stacked at the top of an empty page; they grow past it when
     there is more to show. */
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
    grid-auto-rows: minmax(29vh, auto); }
  ${dots}
</style>
</head>
<body>
<div class="head">
  <h1>Nekan</h1>
  <span class="board">${escapeHtml(snapshot.spaceLabel)}</span>
  <span class="meta">${escapeHtml(snapshot.labels.metaShort)}${
    snapshot.labels.limit ? " · " + escapeHtml(snapshot.labels.limit) : ""
  }</span>
</div>
${htmlSection(snapshot.inbox, "inbox", snapshot.labels)}
<div class="grid">${snapshot.quads
    .map((q) => htmlSection(q, "quad", snapshot.labels))
    .join("")}</div>
</body>
</html>
`;
}
