/**
 * The matrix screen, as far as a shell goes: the bar and the four cards.
 *
 * Nothing here is a placeholder colour or a placeholder name. The quadrants
 * come from QUADS, their labels from the catalogue and their colours from the
 * palette -- so this screen is also the proof that the shared package crossed
 * the bridge. If a quadrant is renamed or recoloured on the desktop, this
 * follows without being edited.
 *
 * The list and the drag come next; the brain dump is drawn as its empty state
 * so the layout it has to live in is settled first. Its box scrolls and the
 * grid below does not -- that is what keeps every drop target on screen and is
 * why this app needs no autoscroll while dragging.
 */
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { QUADS } from "@nekan/shared/core";
import { t } from "../../i18n";
import { SP, useColors } from "../../theme";

export default function MatrixScreen() {
  const c = useColors();
  return (
    <SafeAreaView style={[s.root, { backgroundColor: c.bg }]} edges={["top"]}>
      <View style={[s.bar, { borderBottomColor: c.line }]}>
        <Text style={[s.brand, { color: c.text }]}>Nekan</Text>
        <View
          style={[
            s.switch_,
            { backgroundColor: c["panel-2"], borderColor: c.line },
          ]}
        >
          <Text
            style={[
              s.switchOn,
              { backgroundColor: c.accent, color: c["on-accent"] },
            ]}
          >
            {t("space.work")}
          </Text>
          <Text style={[s.switchOff, { color: c.muted }]}>
            {t("space.life")}
          </Text>
        </View>
      </View>

      <View style={[s.dump, { backgroundColor: c.panel, borderColor: c.line }]}>
        <Text style={[s.dumpTitle, { color: c.text }]}>{t("inbox.title")}</Text>
        <Text style={[s.dumpEmpty, { color: c.faint }]}>
          {t("inbox.empty")}
        </Text>
      </View>

      <View style={s.grid}>
        {QUADS.map((q) => (
          <View
            key={q}
            style={[s.card, { backgroundColor: c.panel, borderColor: c.line }]}
          >
            <View style={[s.wash, { backgroundColor: c[q] }]} />
            <Text style={[s.cardTitle, { color: c.text }]} numberOfLines={2}>
              {t(`quad.${q}.action`)}
            </Text>
            <Text style={[s.count, { color: c.muted }]}>0</Text>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SP["4xl"],
    paddingVertical: SP.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  brand: { fontSize: 17, fontWeight: "700" },
  switch_: {
    flexDirection: "row",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  switchOn: {
    paddingHorizontal: SP["3xl"],
    paddingVertical: SP.sm,
    fontSize: 13,
    fontWeight: "600",
    borderRadius: 999,
  },
  switchOff: {
    paddingHorizontal: SP["3xl"],
    paddingVertical: SP.sm,
    fontSize: 13,
    fontWeight: "600",
  },
  // Shrinks so the grid keeps its size; the grid is the thing you drop onto.
  dump: {
    flex: 1,
    minHeight: 0,
    margin: SP["4xl"],
    marginBottom: SP.md,
    padding: SP["4xl"],
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dumpTitle: { fontSize: 15, fontWeight: "700" },
  dumpEmpty: { marginTop: SP.md, fontSize: 13 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: SP["4xl"],
    paddingBottom: SP["4xl"],
    gap: SP.xl,
  },
  card: {
    flexBasis: "47%",
    flexGrow: 1,
    height: 96,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SP.xl,
    overflow: "hidden",
    justifyContent: "space-between",
  },
  // The quadrant's colour reads as a band rather than a fill: at this size a
  // full card of it would out-shout the four counts, which are the content.
  wash: { position: "absolute", left: 0, right: 0, top: 0, height: 4 },
  cardTitle: { fontSize: 13, fontWeight: "600", marginTop: SP.xs },
  count: { fontSize: 20, fontWeight: "700" },
});
