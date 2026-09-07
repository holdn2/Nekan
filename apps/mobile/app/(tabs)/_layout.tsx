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
 *
 * The header is ours rather than the navigator's, and it is here rather than
 * in each screen because the sync state has to be readable from all three --
 * it used to live inside settings, which is the tab somebody is least likely
 * to be looking at when they wonder whether their work has left the device.
 * `board` is passed per screen: the switch scopes the matrix and the archive,
 * and scopes nothing in settings.
 */
import { Tabs } from "expo-router";
import { AppHeader } from "../../components/header";
import { t } from "../../i18n";
import { useColors } from "../../theme";

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.panel, borderTopColor: c.line },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t("tabs.matrix"), header: () => <AppHeader board /> }}
      />
      <Tabs.Screen
        name="archive"
        options={{
          title: t("tabs.archive"),
          header: () => <AppHeader board />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: t("settings.title"), header: () => <AppHeader /> }}
      />
    </Tabs>
  );
}
