/**
 * Hand the board to the home-screen widget.
 *
 * The widget reads one JSON string from the App Group's shared defaults, and
 * this is the only writer. It runs on every change the store announces --
 * tasks, board, language -- a second after the last one, and once more when
 * the app goes to the background, which is the moment most likely to be the
 * last write for a while.
 *
 * WidgetKit rations reloads, but not for an app in the foreground, and that is
 * the only time this runs. There is no background refresh: a change made on
 * another device reaches the widget the next time this phone opens Nekan. A
 * widget that fetched on its own would need the session in a shared keychain
 * and its own sync client, which is a great deal of machinery for "the widget
 * is a few minutes behind until you open the app".
 *
 * Quiet on anything that is not iOS, and a failure here is only logged in a
 * dev build. The widget is a convenience; failing to feed it must never reach
 * the person using the app.
 */
import { AppState, Platform } from "react-native";
import { ExtensionStorage } from "@bacons/apple-targets";
import { locale, t } from "../i18n";
import { completeFromWidget } from "../store/mutations";
import {
  allTasks,
  currentSpace,
  now,
  subscribe,
  themeChoice,
} from "../store/state";
import { buildFeed } from "./feed";

/** Shared with the widget's Swift (BoardWidget.swift), which reads the same names. */
export const APP_GROUP = "group.com.yoshi.nekan";
export const FEED_KEY = "board.feed";
/**
 * The language on its own, beside the feed. The two buttons' words live in the
 * widget's string catalogue, and all they need is which language to open --
 * decoding the whole board for that would be the wrong way round.
 */
export const LANG_KEY = "app.lang";
/**
 * The other direction: what was checked in the widget, as JSON of id to the
 * time it was pressed. The widget writes it (and unwrites it, when a check is
 * pressed again); the app reads it when it comes to the front and clears it.
 */
export const DONE_KEY = "board.done";

/** A pause long enough that typing a title is one write, not twenty. */
const QUIET_MS = 1000;

export function publishNow(): void {
  // The package swaps in no-ops where the native module is missing (Android,
  // Expo Go), so this is not a crash guard. It keeps a board that can never be
  // read from being serialised a second after every change.
  if (Platform.OS !== "ios") return;
  try {
    const feed = buildFeed(allTasks(), {
      space: currentSpace(),
      lang: locale(),
      t,
      now: new Date(),
      stamp: now(),
      theme: themeChoice(),
    });
    const storage = new ExtensionStorage(APP_GROUP);
    storage.set(FEED_KEY, JSON.stringify(feed));
    storage.set(LANG_KEY, feed.lang);
    // Every widget, not only the board: the two buttons' words follow the
    // app's language too, and a language change is one of the things that
    // brings us here.
    ExtensionStorage.reloadWidget();
  } catch (err) {
    if (__DEV__) console.log("widget feed failed:", err);
  }
}

/**
 * Complete what was checked in the widget, then forget the record.
 *
 * Cleared whether or not anything came of it: a mark for a task that has since
 * been finished elsewhere is not waiting for anything, and left in place it
 * would keep drawing a check over a row the widget has already lost. When
 * nothing changed the store does not announce, so the widget is told directly
 * to redraw without the checks.
 */
export function takeWidgetChecks(): void {
  if (Platform.OS !== "ios") return;
  try {
    const storage = new ExtensionStorage(APP_GROUP);
    const raw = storage.get(DONE_KEY);
    if (!raw) return;
    let marks: unknown = null;
    try {
      marks = JSON.parse(raw);
    } catch {
      marks = null;
    }
    const done =
      marks && typeof marks === "object" && !Array.isArray(marks)
        ? completeFromWidget(marks as Record<string, unknown>)
        : 0;
    storage.remove(DONE_KEY);
    if (!done) ExtensionStorage.reloadWidget();
  } catch (err) {
    if (__DEV__) console.log("widget checks failed:", err);
  }
}

/**
 * Start listening. Returns the way to stop, for the root layout's effect.
 *
 * Nothing is written until the store has loaded -- an empty board written in
 * the first frame would blank the widget until the next change.
 */
export function startPublishing(ready: () => boolean): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  // The widget's checks are taken once the board has loaded -- before that
  // there is nothing to complete -- and each time the app comes back.
  let taken = false;
  const soon = () => {
    if (!ready()) return;
    if (!taken) {
      taken = true;
      takeWidgetChecks();
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      publishNow();
    }, QUIET_MS);
  };
  const unsubscribe = subscribe(soon);
  const appState = AppState.addEventListener("change", (next) => {
    if (next === "active" && ready()) takeWidgetChecks();
    if (next !== "background" || !ready()) return;
    if (timer) clearTimeout(timer);
    timer = null;
    publishNow();
  });
  soon();
  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
    appState.remove();
  };
}
