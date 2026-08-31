/**
 * The three tabs: matrix, archive, settings.
 *
 * Their names come out of the shared catalogue rather than being typed here,
 * so the phone and the desktop cannot drift into calling the same screen two
 * things. The catalogue is read directly for now -- i18next arrives with the
 * settings screen, and until then there is no language to switch to.
 *
 * The bar keeps the platform's own material and takes only its colours from
 * the palette. Drawing the blur ourselves was considered and dropped: a
 * surface whose colour is decided by whatever scrolls behind it cannot be
 * checked by the contrast tests that guard every other colour in this app.
 */
import { Tabs } from "expo-router";
import ko from "@nekan/shared/i18n/ko.json";
import { useColors } from "../../theme";

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.panel, borderTopColor: c.line },
      }}
    >
      <Tabs.Screen name="index" options={{ title: ko.tabs.matrix }} />
      <Tabs.Screen name="archive" options={{ title: ko.tabs.archive }} />
      <Tabs.Screen name="settings" options={{ title: ko.settings.title }} />
    </Tabs>
  );
}
