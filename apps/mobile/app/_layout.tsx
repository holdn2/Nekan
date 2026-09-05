/**
 * The root. Two jobs, both of which have to happen before anything is drawn.
 *
 * It paints the ground: a screen whose background arrives a frame late flashes
 * white on a dark device, and that flash is the first thing a user sees.
 *
 * And it reads the board off disk, once, for every screen.
 */
import { useEffect } from "react";
import { AppState } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useColors, useThemeName } from "../theme";
import { init, languageChoice, redraw, setAuth } from "../store/state";
import { initAuth } from "../api/session";
import { startSync } from "../sync/loop";
import { applyLanguage } from "../i18n";

export default function RootLayout() {
  const c = useColors();
  const theme = useThemeName();

  // Start-up, in order, because the order is load-bearing.
  //
  // Reading the board is the first thing the app does and the only thing that
  // has to finish before rows can be real. It runs here rather than in the
  // matrix screen because the archive reads the same store, and two screens
  // racing to load one file is a bug waiting for a slow disk.
  //
  // The stored language cannot be read at import time -- the store loads from
  // disk and the first screen renders before it lands -- so the device decides
  // the first paint and this corrects it. The desktop has the same problem and
  // solves it by handing the language to the window before it opens; a phone
  // has no such moment.
  //
  // Sync goes last, and that is the part that used to be wrong. Started
  // alongside, a run could reach `saveSyncState` before `init` assigned the
  // settings it had read off disk -- and that assignment would then drop the
  // cursor and the watermark the run had just written. Waiting for the session
  // too costs nothing and spares the first run from finding nobody signed in.
  //
  // Nothing on screen waits for any of this. The board appears when it is
  // read, and whoever was signed in last appears a moment later.
  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      await init();
      if (applyLanguage(languageChoice())) redraw();
      setAuth(await initAuth());
      // The loop watches the app's own comings and goings; this only owns its
      // lifetime, so a reload does not leave a second one running.
      if (!cancelled) stop = startSync();
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  // "System" has to go on meaning the system, and the two settings did not
  // agree on that. The theme follows a device change by itself -- RN re-renders
  // on an appearance change -- while the language was read once and kept.
  // Changing it in the OS does not always restart the app, so coming back to
  // the front is where the question gets asked again.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active" || languageChoice() !== null) return;
      if (applyLanguage(null)) redraw();
    });
    return () => sub.remove();
  }, []);

  return (
    // Gestures need a root of their own, above everything that uses one. The
    // router provides one in some versions and not others; saying it here
    // costs a view and removes the question.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={theme === "dark" ? "light" : "dark"} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: c.bg },
          }}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
