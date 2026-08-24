/**
 * The caps on what a user may type, and the trimming that enforces them.
 *
 * Separate from tasks.ts because these know nothing about a task: they take a
 * string and give back a string the store is allowed to hold.
 */

export const MAX_TEXT = 200;
/** Memos are free-form and multi-line, so they get a much looser cap. */
export const MAX_MEMO = 2000;

/* ------------------------------------------------------------------ tasks */

/** Trim and cut to the shared length cap; inline editing has no maxlength. */
export function clampText(text: unknown): string {
  return String(text == null ? "" : text)
    .trim()
    .slice(0, MAX_TEXT);
}

/**
 * Same idea for memos, but blank means "no memo": the caller stores null so
 * `task.memo` is either a non-empty string or absent, never `''`.
 */
export function clampMemo(memo: unknown): string | null {
  const trimmed = String(memo == null ? "" : memo)
    .trim()
    .slice(0, MAX_MEMO);
  return trimmed || null;
}

/**
 * A brain dump usually arrives as a block of text rather than one line at a
 * time, so every line of a paste becomes its own task. List markers people
 * paste along with it ("- ", "* ", "1. ") are stripped, blank lines drop out,
 * and the batch is capped so a stray paste of a whole document cannot flood
 * the store.
 */
export const MAX_BULK_LINES = 100;

/** One pasted block → one task per surviving line. */
export function splitBulkText(raw: unknown): string[] {
  return String(raw == null ? "" : raw)
    .split(/\r?\n/)
    .map((line) => clampText(line.replace(/^\s*(?:[-*•·]|\d{1,3}[.)])\s+/, "")))
    .filter(Boolean)
    .slice(0, MAX_BULK_LINES);
}
