/**
 * The snapshot as Markdown, for pasting somewhere else.
 *
 * Reads words out of the snapshot and asks the catalogue for nothing.
 */

import type { ExportLabels, ExportSection, Snapshot } from "./types.js";

/** Pipes and newlines would break the row a memo sits in. */
const mdCell = (text: string) =>
  String(text).replace(/\|/g, "\\|").replace(/\s+/g, " ");

/** One quadrant as a numbered markdown list, memos quoted underneath. */
function markdownSection(
  section: ExportSection,
  labels: ExportLabels,
): string[] {
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
export function toMarkdown(snapshot: Snapshot): string {
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
