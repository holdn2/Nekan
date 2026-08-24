/**
 * Types for what dist.js exports.
 *
 * Like check-release.d.ts, this also keeps `tools/` out of the build: without a
 * sibling declaration, importing the .js from a test pulls it into the test
 * project as an input and tsc stops with TS5055, because it would be emitting
 * over the file it just read.
 */

/**
 * The directory electron-builder writes into.
 *
 * `NEKAN_DIST` if set and non-empty, otherwise `build.directories.output` from
 * package.json. Both the packaging run and the release check are handed this
 * one answer rather than each working it out, because they have to agree: the
 * check re-uploads assets from disk when a draft splits, and can only do that
 * where the build actually wrote them.
 */
export function outputDir(): string;
