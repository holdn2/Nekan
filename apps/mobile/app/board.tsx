/**
 * Where the home-screen widget lands: `nekan://board?space=work&quad=q1`,
 * and with `&task=<id>` when a task's text was the thing pressed.
 *
 * Not a screen anyone sees. It turns the widget's board and quadrant into the
 * matrix's, then hands over -- so a tap on the widget opens the same slice it
 * was showing, with that quadrant's list already open, rather than whatever
 * board the app happened to be on last.
 *
 * A task opens on top of that board, so back from its details returns to the
 * quadrant the widget was showing rather than out of the app. A task that has
 * gone since the widget last drew -- finished or deleted on another device --
 * opens the board alone: there is nothing to show, and saying so on a screen
 * of its own would be one more thing to close.
 *
 * The address is a contract with the Swift beside it (targets/quick), and an
 * update over the air can change this file but not that one. Moving or
 * renaming this route means a build as well.
 *
 * It waits for the store. Opened cold from the widget, this runs before the
 * board has been read off disk, and a board switched now would be switched
 * back the moment the file lands -- `init` assigns the saved board. So nothing
 * happens until the store says it is ready, and the store redraws this screen
 * the moment it is.
 */
import { useEffect } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { QUADS, sanitizeSpace } from "@nekan/shared/core";
import type { Quadrant } from "@nekan/shared/types";
import { isBuried } from "@nekan/shared/sync";
import { findTask, isReady, setSpace } from "../store/state";
import { useStore } from "../store/use-store";
import { useColors } from "../theme";

export default function BoardLink() {
  const c = useColors();
  useStore();
  const { space, quad, task } = useLocalSearchParams<{
    space?: string;
    quad?: string;
    task?: string;
  }>();
  const ready = isReady();

  useEffect(() => {
    if (!ready) return;
    // Anything unrecognised falls back rather than failing: a hand-typed link
    // still opens the board, and a quadrant nobody has heard of opens none.
    setSpace(sanitizeSpace(space));
    const open = QUADS.includes(quad as Quadrant) ? (quad as Quadrant) : null;
    // `replace`, so back from the board does not return here. The stamp is
    // fresh each time, so a second tap opens the quadrant again even when the
    // matrix is still mounted with the same value from the first.
    router.replace({
      pathname: "/",
      params: open ? { open, at: String(Date.now()) } : {},
    });
    const target = task ? findTask(task) : undefined;
    const live =
      target &&
      !isBuried(target) &&
      target.deletedAt == null &&
      target.completedAt == null;
    if (live) {
      router.push({ pathname: "/task/[id]", params: { id: target.id } });
    }
  }, [ready, space, quad, task]);

  // The ground only, so the hand-over does not flash white on a dark phone.
  return <View style={{ flex: 1, backgroundColor: c.bg }} />;
}
