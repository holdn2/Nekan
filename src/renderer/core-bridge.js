/**
 * Named exports for everything in shared/core.js.
 *
 * core.js cannot be an ES module — main.js and the tests `require` the same
 * file — so in the page it is a classic <script> that hands its export list to
 * `window.EM_CORE`. Renderer modules could read those values off window
 * directly, but then no file would say where its constants come from and a typo
 * would read as `undefined` instead of failing. Everything goes through here so
 * an import is an import: `import { QUADS } from './core-bridge.js'`.
 *
 * Classic scripts run before deferred module scripts, so EM_CORE is always in
 * place by the time this module evaluates.
 */

const core = window.EM_CORE;

export const {
  QUADS,
  INBOX,
  PLACES,
  FALLBACK_QUAD,
  isCrowded,
  SPACES,
  DEFAULT_SPACE,
  SPACE_LABEL,
  sanitizeSpace,
  spaceFor,
  MAX_TEXT,
  MAX_MEMO,
  MAX_BULK_LINES,
  DAY_MS,
  WEEKDAY,
  startOfToday,
  startOfTomorrow,
  parseDue,
  dueInfo,
  clampText,
  clampMemo,
  splitBulkText,
  orderKeyBetween,
  compareOrder,
  TOMBSTONE_TTL_MS,
  dropExpiredTombstones,
  normalizeTasks,
  DEFAULT_LAYOUT,
  MIN_RATIO,
  MAX_RATIO,
  MIN_COL_PX,
  MIN_ROW_PX,
  clampRatio,
  clampAxis,
  sanitizeLayout,
} = core;
