/**
 * Types for what check-styles.js exports.
 *
 * Like check-release.d.ts, this is also what keeps `tools/` out of the build:
 * without a sibling declaration, importing the .js from a test pulls it into
 * the test project as an input and tsc stops with TS5055, because it would be
 * emitting over the file it just read.
 */

/** One class name and the sheets that define it. */
export interface Duplicate {
  cls: string;
  files: string[];
}

export interface StyleAudit {
  /** How many distinct class names the sheets define between them. */
  classes: number;
  /** Names defined in more than one sheet, worst first. */
  duplicated: Duplicate[];
  /** `@theme` keys that would come back out of Tailwind as a self-reference. */
  circular: string[];
  /** Class names that are both a generated utility and a sheet's own class. */
  shadowed: string[];
  /** How many utilities the build emitted. Zero before utilities are turned on. */
  utilities: number;
  /** Everything wrong, in the words the CLI prints. Empty means it passed. */
  errors: string[];
  /** How far under the ratchet the duplicate count is; positive means tighten it. */
  slack: number;
}

export interface StyleAuditInput {
  /** The area stylesheets, without the entry point. */
  sheets: { name: string; css: string }[];
  /** styles/index.css, which is where `@theme` lives. */
  entryCss?: string;
  /** The stylesheet the build emitted, for checking real utilities. */
  builtCss?: string;
  /** Defaults to MAX_DUPLICATED; pass it to test the ratchet itself. */
  max?: number;
}

/** The duplicate-class ratchet: the count on the day the plumbing landed. */
export const MAX_DUPLICATED: number;

/** Every class name a stylesheet defines, selectors only. */
export function classesIn(css: string): Set<string>;

/** Which sheets define each class name. */
export function definitionsBySheet(
  sheets: { name: string; css: string }[],
): Map<string, string[]>;

/** `@theme` keys the sheets also read as a custom property of the same name. */
export function circularThemeKeys(
  entryCss: string,
  sheetsCss: string,
): string[];

/** Utility class names present in a built stylesheet's `utilities` layer. */
export function emittedUtilities(builtCss: string): Set<string>;

/** Judge a set of stylesheets. */
export function auditStyles(input: StyleAuditInput): StyleAudit;
