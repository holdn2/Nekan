/**
 * The root. Two jobs, both of which have to happen before anything is drawn.
 *
 * It paints the ground: a screen whose background arrives a frame late flashes
 * white on a dark device, and that flash is the first thing a user sees.
 *
 * And it reads the board off disk, once, for every screen.
 */
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useColors, useThemeName } from "../theme";
import { init } from "../store/state";

export default function RootLayout() {
  const c = useColors();
  const theme = useThemeName();

  // Reading the board is the first thing the app does and the only thing that
  // has to finish before rows can be real. It runs here rather than in the
  // matrix screen because the archive reads the same store, and two screens
  // racing to load one file is a bug waiting for a slow disk.
  useEffect(() => {
    void init();
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
