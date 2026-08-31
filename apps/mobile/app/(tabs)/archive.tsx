/**
 * Archive: history and trash under one tab, as two tabs of its own.
 *
 * The outer name is new -- the desktop has no word for "the two together" --
 * but the inner two keep theirs, because the catalogue already fixes them and
 * a screen should not be called one thing on a phone and another on a laptop.
 */
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ko from "@nekan/shared/i18n/ko.json";
import { SP, useColors } from "../../theme";

export default function ArchiveScreen() {
  const c = useColors();
  return (
    <SafeAreaView style={[s.root, { backgroundColor: c.bg }]} edges={["top"]}>
      <View style={[s.tabs, { borderBottomColor: c.line }]}>
        <Text
          style={[s.tab, s.on, { color: c.text, borderBottomColor: c.accent }]}
        >
          {ko.tabs.history}
        </Text>
        <Text style={[s.tab, { color: c.muted }]}>{ko.tabs.trash}</Text>
      </View>
      <Text style={[s.empty, { color: c.faint }]}>
        {ko.archive.historyEmpty}
      </Text>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  tabs: {
    flexDirection: "row",
    gap: SP["5xl"],
    paddingHorizontal: SP["4xl"],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: { paddingVertical: SP.xl, fontSize: 15, fontWeight: "600" },
  on: { borderBottomWidth: 2 },
  empty: { padding: SP["4xl"], fontSize: 13 },
});
