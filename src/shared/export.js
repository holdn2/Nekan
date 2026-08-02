/**
 * Export documents built from the task list: Markdown to paste somewhere else,
 * HTML to read in a browser — and the same HTML is what main.js prints to get
 * the PDF, so the three formats can never drift apart.
 *
 * Pure string building on purpose (no Node, DOM or Electron APIs) so the part
 * that is easy to get wrong — which tasks are in, how an empty quadrant reads,
 * how text with `<` or `|` in it is escaped — is testable without the app.
 *
 * Only what is on screen is exported: one matrix (업무 or 일상) — its inbox plus
 * its four quadrants. Completed and trashed tasks belong to the history and
 * trash tabs, and the other matrix belongs to its own export.
 */

const {
  QUADS,
  INBOX,
  SPACE_LABEL,
  dueInfo,
  normalizeTasks,
  sanitizeSpace,
} = require('./core');

/** Mirrors the quadrant headers in renderer/index.html. */
const QUAD_TITLES = {
  q1: { title: 'Urgent & Important', action: 'Do 진행하기' },
  q2: { title: 'Important & Not Urgent', action: 'Plan 계획하기' },
  q3: { title: 'Urgent & Not Important', action: 'Delegate 위임하기' },
  q4: { title: 'Not Urgent & Not Important', action: 'Delete 제거하기' },
};

const INBOX_TITLE = '다 꺼내기';

/** Print colours, matching the light palette in styles.css. */
const QUAD_COLOR = {
  inbox: '#8d887d',
  q1: '#c85a4d',
  q2: '#4a72b8',
  q3: '#c1892c',
  q4: '#8d887d',
};

const pad = (n) => String(n).padStart(2, '0');

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
function defaultFileName(now = new Date(), ext = 'pdf', space) {
  return `아이젠하워 매트릭스 ${SPACE_LABEL[sanitizeSpace(space)]} ${isoDay(now)}.${ext}`;
}

function exportItem(task, now) {
  const due = dueInfo(task.dueDate, now);
  return {
    text: task.text,
    // Both parts are kept: the date survives printing, the hint ("3일 남음")
    // is what makes it readable at a glance on the day it was exported.
    due: due ? { text: due.text, hint: due.hint, state: due.state } : null,
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
function buildSnapshot(tasks, now = new Date(), space) {
  const board = sanitizeSpace(space);
  const list = normalizeTasks(tasks).filter(
    (t) => !t.completedAt && !t.deletedAt && (t.space === null || t.space === board)
  );
  const inList = (q) => list.filter((t) => t.quadrant === q);

  const sections = [
    {
      key: INBOX,
      title: INBOX_TITLE,
      action: '분류하기 전에 적어둔 것',
      items: inList(INBOX).map((t) => exportItem(t, now)),
    },
    ...QUADS.map((q) => ({
      key: q,
      title: QUAD_TITLES[q].title,
      action: QUAD_TITLES[q].action,
      items: inList(q).map((t) => exportItem(t, now)),
    })),
  ];

  return {
    stamp: stampLabel(now),
    space: board,
    spaceLabel: SPACE_LABEL[board],
    total: sections.reduce((sum, s) => sum + s.items.length, 0),
    inbox: sections[0],
    quads: sections.slice(1),
    sections,
  };
}

/* -------------------------------------------------------------- markdown */

/** Pipes and newlines would break the row a memo sits in. */
const mdCell = (text) => String(text).replace(/\|/g, '\\|').replace(/\s+/g, ' ');

function markdownSection(section) {
  const lines = [`## ${section.title}`, '', `_${section.action}_`, ''];
  if (!section.items.length) {
    lines.push('_(비어 있음)_', '');
    return lines;
  }
  section.items.forEach((item, i) => {
    const due = item.due ? ` — 마감 ${item.due.text} (${item.due.hint})` : '';
    lines.push(`${i + 1}. ${mdCell(item.text)}${due}`);
    // Memo lines are indented so they stay inside the numbered item.
    if (item.memo) {
      item.memo
        .split(/\r?\n/)
        .forEach((line) => lines.push(`   > ${mdCell(line)}`));
    }
  });
  lines.push('');
  return lines;
}

function toMarkdown(snapshot) {
  const lines = [
    `# 아이젠하워 매트릭스 — ${snapshot.spaceLabel}`,
    '',
    `내보낸 시각: ${snapshot.stamp} · 항목 ${snapshot.total}개`,
    '',
  ];
  snapshot.sections.forEach((s) => lines.push(...markdownSection(s)));
  return `${lines.join('\n').trimEnd()}\n`;
}

/* ------------------------------------------------------------------ html */

const escapeHtml = (text) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function htmlItem(item) {
  const parts = [`<span class="t">${escapeHtml(item.text)}</span>`];
  if (item.due) {
    parts.push(
      `<span class="due ${item.due.state}">${escapeHtml(item.due.text)}` +
        ` · ${escapeHtml(item.due.hint)}</span>`
    );
  }
  const memo = item.memo
    ? `<p class="memo">${escapeHtml(item.memo).replace(/\r?\n/g, '<br>')}</p>`
    : '';
  return `<li><div class="row">${parts.join('')}</div>${memo}</li>`;
}

function htmlSection(section, tag) {
  const body = section.items.length
    ? `<ol>${section.items.map(htmlItem).join('')}</ol>`
    : '<p class="empty">비어 있음</p>';
  return (
    `<section class="${tag} ${section.key}">` +
    '<header>' +
    `<span class="dot"></span>` +
    `<h2>${escapeHtml(section.title)}</h2>` +
    `<span class="act">${escapeHtml(section.action)}</span>` +
    `<span class="n">${section.items.length}</span>` +
    '</header>' +
    body +
    '</section>'
  );
}

/**
 * A standalone page: no external CSS, fonts or scripts, because it is opened
 * straight from disk and printed headlessly. Always the light palette — the
 * dark theme would print as a black rectangle.
 */
function toHtml(snapshot) {
  const dots = Object.entries(QUAD_COLOR)
    .map(([key, color]) => `.${key} .dot{background:${color}}`)
    .join('');

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>아이젠하워 매트릭스 ${escapeHtml(snapshot.spaceLabel)} ${escapeHtml(snapshot.stamp)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 18px 20px 24px;
    font-family: "Malgun Gothic", "Segoe UI", system-ui, sans-serif;
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
  <h1>아이젠하워 매트릭스</h1>
  <span class="board">${escapeHtml(snapshot.spaceLabel)}</span>
  <span class="meta">${escapeHtml(snapshot.stamp)} · 항목 ${snapshot.total}개</span>
</div>
${htmlSection(snapshot.inbox, 'inbox')}
<div class="grid">${snapshot.quads.map((q) => htmlSection(q, 'quad')).join('')}</div>
</body>
</html>
`;
}

module.exports = {
  QUAD_TITLES,
  INBOX_TITLE,
  isoDay,
  stampLabel,
  defaultFileName,
  buildSnapshot,
  toMarkdown,
  toHtml,
  escapeHtml,
};
