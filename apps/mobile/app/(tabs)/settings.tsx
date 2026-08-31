/**
 * Settings: the gear panel's contents, plus the guide.
 *
 * The guide lives here rather than in a tab of its own -- the bar holds three
 * and the guide is read once. It still has to be complete: the pass mark for
 * this app is that the guide alone is enough to use it, and the phone's
 * gestures are not the desktop's, so it will say more here, not less.
 */
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ko from "@nekan/shared/i18n/ko.json";
import { SP, useColors } from "../../theme";

const ROWS = [
  ko.settings.theme,
  ko.settings.language,
  ko.settings.export,
  ko.settings.sync,
  ko.tabs.guide,
] as const;

export default function SettingsScreen() {
  const c = useColors();
  return (
    <SafeAreaView style={[s.root, { backgroundColor: c.bg }]} edges={["top"]}>
      <Text style={[s.title, { color: c.text }]}>{ko.settings.title}</Text>
      <View style={[s.card, { backgroundColor: c.panel, borderColor: c.line }]}>
        {ROWS.map((label, i) => (
          <Text
            key={label}
            style={[
              s.row,
              { color: c.text, borderTopColor: c.line },
              i === 0 && s.first,
            ]}
          >
            {label}
          </Text>
        ))}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  title: {
    fontSize: 22,
    fontWeight: "700",
    paddingHorizontal: SP["4xl"],
    paddingTop: SP["4xl"],
    paddingBottom: SP.xl,
  },
  card: {
    marginHorizontal: SP["4xl"],
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  row: {
    paddingHorizontal: SP["4xl"],
    paddingVertical: SP["3xl"],
    fontSize: 15,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  first: { borderTopWidth: 0 },
});
