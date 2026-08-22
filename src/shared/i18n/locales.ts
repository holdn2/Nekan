/**
 * Which languages exist, and which one a machine should start in.
 *
 * Pure and dependency-free on purpose: main decides the startup language before
 * any window exists, and the tests drive this without an Electron around them.
 * The catalogues themselves are JSON next to this file -- main `require`s them,
 * the renderer imports them with `{ type: "json" }`, and both were checked
 * inside a packaged asar before anything was written against them.
 */

/** Every language with a catalogue. The order is what a picker should show. */
export const SUPPORTED = ["ko", "en"] as const;

/** One of the languages that has a catalogue. */
export type Language = (typeof SUPPORTED)[number];

/** True for a string this app can actually serve. Narrows, which is the point. */
const isSupported = (tag: string): tag is Language =>
  (SUPPORTED as readonly string[]).includes(tag);

/**
 * What to fall back to.
 *
 * English rather than Korean, which is the opposite of what this app started
 * as. The reasoning is about who is surprised: a Korean speaker whose machine
 * is not in Korean is a rounding error, while everybody else in the world would
 * otherwise open a widget written in a script they cannot read and have to find
 * the settings panel by shape.
 */
export const FALLBACK: Language = "en";

/**
 * The language to open in, from an OS locale like "ko-KR" or "en-GB".
 *
 * Matched on the language subtag alone. `app.getLocale()` answers with region
 * attached and there is no per-region catalogue, so "ko-KR" and a bare "ko"
 * have to land in the same place.
 */
export function pickLanguage(osLocale: string | null | undefined): Language {
  const tag = String(osLocale || "")
    .toLowerCase()
    .split(/[-_]/)[0];
  return isSupported(tag) ? tag : FALLBACK;
}

/** A stored `settings.language`, or null when it is not one we can serve. */
export function storedLanguage(value: unknown): Language | null {
  return typeof value === "string" && isSupported(value) ? value : null;
}
