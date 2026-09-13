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
 * package.json. The packaging run and the release check are handed this one
 * answer rather than each working it out, because they have to agree: the check
 * re-uploads assets from disk when a draft splits, and can only do that where
 * the build actually wrote them.
 *
 * Only the local half follows it. .github/workflows/mac-build.yml names `dist`
 * literally in its artifact globs and its codesign step, so moving
 * build.directories.output would need those changed too.
 */
export function outputDir(): string;

/**
 * The path to electron-builder's own CLI entry, asked of its package manifest.
 *
 * Resolved rather than reached through npx, because npx is a .cmd on Windows
 * and Node will not spawn one without a shell -- and a shell would re-parse the
 * output path, splitting it on spaces and cutting it at an `&`.
 */
export function builderCli(): string;

/**
 * The two flags this script takes, or a throw naming what else was passed.
 *
 * Unknown arguments are refused rather than ignored: nothing here reaches
 * electron-builder, and `--publish never` -- what package.json said one commit
 * ago -- would otherwise read as `--publish` and upload.
 */
export function parseArgs(argv: string[]): { mac: boolean; publish: boolean };

/** The name of the file a publishing build leaves beside its installers. */
export const STAMP: string;

/**
 * Why this build may not be published, as lines to print, or null to go ahead.
 *
 * The mac workflow has refused a publish from outside main since it was
 * written -- "the release is built from main, so this would upload a bundle
 * that is not what the tag points at" -- and the half that creates the draft
 * and makes the installer people download had no such guard. A dirty tree is
 * the same objection in a smaller shape: an installer built over uncommitted
 * edits belongs to no commit, so nothing in the repository describes it.
 *
 * Takes the answers rather than asking git itself, so the judgement can be
 * checked without putting a repository into each state.
 */
export function releaseBlocker(state: {
  /** The current branch, or null if git could not be read at all. */
  branch: string | null;
  /** `git status --porcelain` -- empty on a clean tree. */
  dirty: string | null;
}): string[] | null;
