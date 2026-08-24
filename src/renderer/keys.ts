/**
 * Which modifier means "this is a shortcut".
 *
 * On macOS that is Cmd, everywhere else Ctrl, and a KeyboardEvent reports them
 * as two different fields -- `metaKey` and `ctrlKey`. Checking only `ctrlKey`
 * is not a mac shortcut that behaves oddly; it is no mac shortcut at all,
 * because Cmd never sets `ctrlKey`. The Ctrl key a Mac does have is not the one
 * anybody there reaches for.
 *
 * It lives in its own file because the two places that ask are unrelated -- the
 * global keys and the note's textarea -- and the answer has to be the same in
 * both. The alternative was for each to read `window.api.platform` and spell
 * the comparison out again.
 */

/** The one question worth asking about the platform in the renderer. */
const isMac = window.api?.platform === "darwin";

/**
 * Is the accelerator held, and only the accelerator?
 *
 * AltGr reports itself as ctrlKey+altKey on Windows, so without the altKey test
 * a layout that types @ or € through AltGr would fire a shortcut *and* have
 * preventDefault eat the character. On macOS Option composes characters the
 * same way, so the test earns its keep on both.
 */
const accel = (e: KeyboardEvent) =>
  (isMac ? e.metaKey : e.ctrlKey) && !e.altKey;

/** The word for it, for anything the user reads. */
const accelName = () => (isMac ? "Cmd" : "Ctrl");

export { isMac, accel, accelName };
