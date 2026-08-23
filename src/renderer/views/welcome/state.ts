/**
 * Whether the first-run question is still up, and what happens when it is
 * answered.
 *
 * Held outside the component because two other places need it and neither is
 * inside this card: main refuses to fold the window while the question is open
 * -- a bar shows nothing but the icon, and covers the button that would undo
 * it -- and app.ts is what puts the card on screen in the first place.
 */

import { needsStartupChoice } from "../../../shared/core.js";

/**
 * Is there a choice still to make? The rule lives in shared/core.js because
 * main asks it too — it is what keeps the window out of bar mode until this
 * screen is done with it.
 */
export const needsWelcome = needsStartupChoice;

/**
 * Failures worth naming. Anything else falls through as its own code, which is
 * something a user can quote back and I can search for.
 */
const REASONS: Record<string, string> = {
  offline: "account.error.offline",
  timeout: "account.error.timeout",
  denied: "account.error.cancelled",
  access_denied: "account.error.cancelled",
  cancelled: "account.error.cancelled",
  no_browser: "account.error.noBrowser",
  no_loopback: "account.error.noLoopback",
  no_secure_storage: "account.error.noSecureStorage",
  flow_state_not_found: "account.error.expired",
  bad_response: "account.error.badResponse",
};

/** Whether the card is up, and how a finished choice reaches the startup. */
let visible = false;
let onDone: (choice: string) => void = () => {};
let announce: () => void = () => {};

/** Put it on screen. The count on the merge line follows the store from here. */
export function showWelcome() {
  visible = true;
  announce();
}

/** Set by app.js before the card can be shown. */
export function wireWelcome(done: (choice: string) => void) {
  onDone = done;
}

/** Set by the component, so showWelcome() can reach a card already mounted. */
function setAnnounce(fn: () => void) {
  announce = fn;
}

/** Is the card up? */
const isWelcomeVisible = () => visible;

/**
 * Take it down, and tell app.ts which way it was answered.
 *
 * Called only once the answer is stored -- see the comment on the caller.
 * Hiding first and writing afterwards leaves somebody who has plainly answered
 * the question being asked it again on the next launch.
 */
function welcomeAnswered(choice: string) {
  visible = false;
  onDone(choice);
}

/**
 * A failure worth naming, as a catalogue key, or null.
 *
 * Anything unnamed falls through as its own code, which is something a user
 * can quote back and I can search for.
 */
const reasonKey = (code: string): string | null => REASONS[code] ?? null;

export { isWelcomeVisible, reasonKey, setAnnounce, welcomeAnswered };
