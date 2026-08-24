/**
 * Types for what check-release.js exports.
 *
 * This file also keeps `tools/` out of the build. Without it, importing the
 * .js from a test pulls it into the test project as an input, and tsc stops
 * with TS5055 -- it would be emitting over the file it just read. A sibling
 * declaration is what makes the import type-only.
 *
 * The script itself stays plain CommonJS: it runs as `node tools/...` from an
 * npm script, before and after the build, so it cannot be something the build
 * has to produce first.
 */

export interface ReleaseAudit {
  /** Platforms whose files were checked -- "windows" always, "mac" once one of its files appears. */
  platforms: string[];
  /** Required files that are not there, as "platform: what". Empty means complete. */
  missing: string[];
  /** Assets no platform claims. Empty means nothing unrecognised got in. */
  unexpected: string[];
}

/** The architectures `build.mac.target` ships, so the check cannot drift from the config. */
export function macArches(pkg?: unknown): string[];

/**
 * Judge a list of release asset names.
 *
 * `arches` defaults to what package.json declares; pass it to test the rules
 * against a configuration other than this repository's.
 */
export function auditAssets(names: string[], arches?: string[]): ReleaseAudit;
