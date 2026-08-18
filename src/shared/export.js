/**
 * Export documents built from the task list: Markdown to paste somewhere else,
 * HTML to read in a browser — and the same HTML is what main.js prints to get
 * the PDF, so the three formats can never drift apart.
 *
 * Pure string building on purpose (no Node, DOM or Electron APIs) so the part
 * that is easy to get wrong — which tasks are in, how an empty quadrant reads,
 * how text with `<` or `|` in it is escaped — is testable without the app.
 *
 * There is no catalogue in here either, for the same reason. `buildSnapshot`
 * takes a `t` and resolves *every* string it will ever need into the snapshot;
 * `toMarkdown` and `toHtml` then read words out of that object rather than
 * asking for them. It is the same trick the due dates already used — a printed
 * page cannot recompute anything — extended to the rest of the document.
 *
 * Only what is on screen is exported: one matrix (Work or Life) — its inbox plus
 * its four quadrants. Completed and trashed tasks belong to the history and
 * trash tabs, and the other matrix belongs to its own export.
 */

const {
  QUADS,
  INBOX,
  compareOrder,
  dueInfo,
  formatDue,
  normalizeTasks,
  sanitizeSpace,
} = require("./core");

/** Print colours, matching the light palette in styles.css. */
const QUAD_COLOR = {
  inbox: "#8d887d",
  q1: "#c85a4d",
  q2: "#4a72b8",
  q3: "#c1892c",
  q4: "#8d887d",
};

/** Two-digit number for the date and time stamps. */
const pad = (n) => String(n).padStart(2, "0");

/** 'YYYY-MM-DD', built locally so it matches the day the user sees. */
function isoDay(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Stamp in the document header: '2026-08-02 14:30'. */
function stampLabel(now = new Date()) {
  return `${isoDay(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/**
 * Suggested save name; the extension picks the format in main.js. The board's
 * name is in there because the two matrices export separately — without it the
 * second file would be offered the name of the first.
 */
function defaultFileName(now = new Date(), ext = "pdf", space, t) {
  return `Nekan ${t(`space.${sanitizeSpace(space)}`)} ${isoDay(now)}.${ext}`;
}

/**
 * One task, reduced to what a document needs. The live urgency is resolved
 * here because a printed page cannot recompute it later.
 */
function exportItem(task, now, { t, locale }) {
  const info = dueInfo(task.dueDate, now);
  const due = formatDue(info, t, locale);
  return {
    text: task.text,
    // Both parts are kept: the date survives printing, the hint ("3 days left")
    // is what makes it readable at a glance on the day it was exported.
    due: due
      ? {
          text: due.text,
          hint: due.hint,
          state: info.state,
          // Markdown runs the two into a sentence, HTML sets them side by side.
          // Only the first needs words of its own.
          line: t("export.due", { date: due.text, hint: due.hint }),
        }
      : null,
    memo: task.memo || null,
  };
}

/**
 * One matrix, in the order the lists show it. `normalizeTasks` runs first
 * because the main process holds data.json as it was read: a task saved before
 * a field existed, or with a quadrant this version does not know, has to land
 * in the same place the UI would put it rather than vanish from the export.
 * It is also what puts every pre-split task on a board, and guarantees inbox
 * tasks have no space — which is why they survive the filter on both boards.
 */
/** How many rows of any one list reach the page. See the note in buildSnapshot. */
const PER_SECTION = 20;

function buildSnapshot(tasks, now = new Date(), space, i18n) {
  const { t, locale } = i18n;
  const board = sanitizeSpace(space);
  const list = normalizeTasks(tasks).filter(
    (t) =>
      !t.purgedAt &&
      !t.completedAt &&
      !t.deletedAt &&
      (t.space === null || t.space === board),
  );
  // Same order the quadrant shows: the array is storage order, `orderKey` is
  // the user's. normalizeTasks() above has already given every row one.
  const inList = (q) => list.filter((t) => t.quadrant === q).sort(compareOrder);

  // Every list gets the same ceiling, and the section says how many it left.
  //
  // Not a formatting preference -- the printed matrix is a two-column grid, and
  // a grid row is as tall as its tallest cell. Measured 2026-08-18 with 300
  // tasks in quadrant 2: the document ran to 11 pages, quadrant 1 became a
  // 6129px box holding one task and nine pages of white, and quadrants 3 and 4
  // came out at the very end. Past roughly 25 rows a quadrant stops fitting a
  // page, so the ceiling sits below that.
  //
  // The dump is capped too. It prints full width above the matrix, so a long
  // one pushes the whole board off the first page for the same reason.
  const section = (key, title, action, quadrant) => {
    const all = inList(quadrant);
    const shown = all.slice(0, PER_SECTION);
    const hidden = all.length - shown.length;
    return {
      key,
      title,
      action,
      items: shown.map((task) => exportItem(task, now, i18n)),
      // What the quadrant really holds, which is not what is on the page.
      count: all.length,
      hidden,
      more: hidden ? t("export.more", { count: hidden }) : "",
    };
  };

  const sections = [
    section(INBOX, t("inbox.title"), t("export.inboxAction"), INBOX),
    ...QUADS.map((q) =>
      section(q, t(`quad.${q}.title`), t(`quad.${q}.action`), q),
    ),
  ];

  const stamp = stampLabel(now);
  // The board's size, not the document's: a count that dropped to 100 whenever
  // someone had more would read as tasks having gone missing.
  const total = sections.reduce((sum, s) => sum + s.count, 0);
  const truncated = sections.some((s) => s.hidden > 0);

  return {
    stamp,
    space: board,
    spaceLabel: t(`space.${board}`),
    total,
    truncated,
    perSection: PER_SECTION,
    inbox: sections[0],
    quads: sections.slice(1),
    sections,
    // Everything the two formatters below would otherwise have to ask for. They
    // are handed the finished document, not a catalogue.
    lang: locale,
    labels: {
      meta: t("export.meta", { stamp, count: total }),
      metaShort: t("export.metaShort", { stamp, count: total }),
      empty: t("export.sectionEmpty"),
      // Stated once, at the top, and only when it actually bit.
      limit: truncated ? t("export.limit", { limit: PER_SECTION }) : "",
    },
  };
}

/* -------------------------------------------------------------- markdown */

/** Pipes and newlines would break the row a memo sits in. */
const mdCell = (text) =>
  String(text).replace(/\|/g, "\\|").replace(/\s+/g, " ");

/** One quadrant as a numbered markdown list, memos quoted underneath. */
function markdownSection(section, labels) {
  const lines = [`## ${section.title}`, "", `_${section.action}_`, ""];
  const tail = section.more ? [`_${section.more}_`, ""] : [];
  if (!section.items.length) {
    lines.push(`_(${labels.empty})_`, "");
    return lines;
  }
  section.items.forEach((item, i) => {
    const due = item.due ? ` — ${item.due.line}` : "";
    lines.push(`${i + 1}. ${mdCell(item.text)}${due}`);
    // Memo lines are indented so they stay inside the numbered item.
    if (item.memo) {
      item.memo
        .split(/\r?\n/)
        .forEach((line) => lines.push(`   > ${mdCell(line)}`));
    }
  });
  lines.push(...tail, "");
  return lines;
}

/** The whole document: header, then one section per quadrant. */
function toMarkdown(snapshot) {
  const lines = [
    `# Nekan — ${snapshot.spaceLabel}`,
    "",
    snapshot.labels.limit
      ? `${snapshot.labels.meta} · ${snapshot.labels.limit}`
      : snapshot.labels.meta,
    "",
  ];
  snapshot.sections.forEach((s) =>
    lines.push(...markdownSection(s, snapshot.labels)),
  );
  return `${lines.join("\n").trimEnd()}\n`;
}

/* ------------------------------------------------------------------ html */

const escapeHtml = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** One row: title, optional due chip, optional memo paragraph. */
function htmlItem(item) {
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
function htmlSection(section, tag, labels) {
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
function toHtml(snapshot, { fontUrl } = {}) {
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
    font-family: "Pretendard Variable", "Pretendard", "Malgun Gothic",
      "Segoe UI", system-ui, sans-serif;
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

module.exports = {
  isoDay,
  stampLabel,
  defaultFileName,
  buildSnapshot,
  toMarkdown,
  toHtml,
  escapeHtml,
};
