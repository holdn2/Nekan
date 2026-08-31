/**
 * The root. It exists to paint the ground before anything else does: a screen
 * whose background comes from a stylesheet the phone has not read yet flashes
 * white on a dark device, and that flash is the first thing a user sees.
 */
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useColors, useThemeName } from "../theme";

export default function RootLayout() {
  const c = useColors();
  const theme = useThemeName();
  return (
    <SafeAreaProvider>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
        }}
      />
    </SafeAreaProvider>
  );
}
