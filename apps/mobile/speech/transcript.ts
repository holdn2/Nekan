/**
 * The two decisions dictation makes that do not need a microphone.
 *
 * Everything else in speech/ talks to the native recogniser and can only be
 * checked on a device. These two can be wrong in ways nobody would notice on a
 * device either -- a locale that silently falls back to English, a transcript
 * that eats what was already typed -- so they live here, apart, where tests
 * reach them.
 */

/**
 * The tag the recogniser wants, from the tag the app uses.
 *
 * The catalogue keys are language only ("ko"), and the recogniser wants a
 * region as well: iOS matches on the full identifier and answers
 * "language-not-supported" to a bare one. The region is the majority speaker
 * population rather than the user's, which is the wrong question to ask here
 * -- the app has no country, and a Korean speaker in Toronto still dictates
 * Korean.
 */
export function speechLocale(language: string | null | undefined): string {
  const lang = String(language || "").toLowerCase();
  if (lang.startsWith("ko")) return "ko-KR";
  return "en-US";
}

/**
 * What the field should show, given what was in it when the mic was pressed.
 *
 * Dictation streams: the same sentence arrives half a dozen times, each a
 * little longer, and only the last one is final. So the field cannot simply be
 * appended to -- that would stack every draft on top of the last. It is
 * rebuilt each time from the text that was already there plus the newest
 * version of what is being said.
 *
 * The space between them is only added when there is something on both sides,
 * so dictating into an empty field does not produce a leading space, and
 * dictating after a line break does not turn it into "line\n word".
 */
export function composeDictation(base: string, heard: string): string {
  const said = heard.trim();
  if (!said) return base;
  if (!base) return said;
  return /\s$/.test(base) ? base + said : `${base} ${said}`;
}

/**
 * Is the model for this tag among the ones the device has installed?
 *
 * Compared loosely on purpose. The recogniser reports what it has in whatever
 * shape its platform uses -- `ko-KR`, `ko_KR`, sometimes just `ko` -- and a
 * strict match would turn the feature off on a device that can perfectly well
 * do the job. The language is what has to agree; the region is a preference,
 * and asking for ko-KR on a device holding only `ko` is not a refusal.
 */
export function hasModelFor(tag: string, installed: string[]): boolean {
  const want = tag.toLowerCase().replace("_", "-").split("-")[0];
  return (installed || []).some(
    (have) =>
      String(have).toLowerCase().replace("_", "-").split("-")[0] === want,
  );
}
