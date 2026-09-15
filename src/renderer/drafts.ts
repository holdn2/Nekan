/**
 * Text that has been typed and not yet written.
 *
 * The memo panel writes a note on a pause (issue 136), and a pause is not always
 * given: the selection changes, the window folds to the bar, the window
 * closes. The code that does those things does not know the panel -- selection
 * is imported by the matrix and the title bar, and neither may import a view --
 * so the panel registers what it holds here and they ask for it to be written
 * before they act.
 *
 * Holds callbacks, not text. Whoever registers decides what "write" means,
 * including when there is nothing worth writing.
 */

const flushers = new Set<() => void>();

/** Register a way to write pending text. Answers the function that removes it. */
export function registerDraftFlusher(flush: () => void) {
  flushers.add(flush);
  return () => {
    flushers.delete(flush);
  };
}

/** Write everything pending, now. Safe to call with nothing registered. */
export function flushDrafts() {
  for (const flush of [...flushers]) flush();
}
