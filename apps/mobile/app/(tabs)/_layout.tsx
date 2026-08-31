/**
 * The three tabs: matrix, archive, settings.
 *
 * Their names come out of the shared catalogue rather than being typed here,
 * so the phone and the desktop cannot drift into calling the same screen two
 * things -- and through `t`, so they come out in the language the device is
 * set to rather than in Korean on every phone.
 *
 * The bar keeps the platform's own material and takes only its colours from
 * the palette. Drawing the blur ourselves was considered and dropped: a
 * surface whose colour is decided by whatever scrolls behind it cannot be
 * checked by the contrast tests that guard every other colour in this app.
 */
import { Tabs } from "expo-router";
import { t } from "../../i18n";
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
      <Tabs.Screen name="index" options={{ title: t("tabs.matrix") }} />
      <Tabs.Screen name="archive" options={{ title: t("tabs.archive") }} />
      <Tabs.Screen name="settings" options={{ title: t("settings.title") }} />
    </Tabs>
  );
}
