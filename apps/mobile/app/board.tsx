/**
 * Where the home-screen widget lands: `nekan://board?space=work&quad=q1`.
 *
 * Not a screen anyone sees. It turns the widget's board and quadrant into the
 * matrix's, then hands over -- so a tap on the widget opens the same slice it
 * was showing, with that quadrant's list already open, rather than whatever
 * board the app happened to be on last.
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
import { isReady, setSpace } from "../store/state";
import { useStore } from "../store/use-store";
import { useColors } from "../theme";

export default function BoardLink() {
  const c = useColors();
  useStore();
  const { space, quad } = useLocalSearchParams<{
    space?: string;
    quad?: string;
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
  }, [ready, space, quad]);

  // The ground only, so the hand-over does not flash white on a dark phone.
  return <View style={{ flex: 1, backgroundColor: c.bg }} />;
}
