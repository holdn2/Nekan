/**
 * The guide, written for a phone.
 *
 * Not the desktop's. That one explains a widget: bar mode, window sizing, and
 * a page of keyboard shortcuts -- none of which a phone has, and describing
 * keys that are not there is worse than saying nothing. The gestures here have
 * no counterpart on the desktop either, so the two texts diverge because the
 * things they describe do.
 *
 * What they share is the part that is not about either machine: the four
 * quadrants. Those explanations come from `guide.q1..q4`, the same entries the
 * desktop reads, because Eisenhower's idea does not change with the screen.
 *
 * A route rather than a section of settings: it is a document, and a document
 * that can be left is easier to read than one that pushes the settings it was
 * opened from off the bottom.
 */
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Pressable } from "react-native-gesture-handler";
import { QUADS } from "@nekan/shared/core";
import type { Quadrant } from "@nekan/shared/types";
import { CloseIcon } from "../icons";
import { plain, t } from "../i18n";
import { FS, FW, LH, R, SP, useColors } from "../theme";

/** A heading and the paragraphs under it. */
function Section({ title, lines }: { title: string; lines: string[] }) {
  const c = useColors();
  return (
    <View style={s.section}>
      <Text style={[s.heading, { color: c.text }]}>{title}</Text>
      {lines.map((line, i) => (
        <Text key={i} style={[s.body, { color: c.muted }]}>
          {line}
        </Text>
      ))}
    </View>
  );
}

export default function GuideScreen() {
  const c = useColors();

  return (
    <SafeAreaView style={[s.root, { backgroundColor: c.bg }]} edges={["top"]}>
      <View style={[s.bar, { borderBottomColor: c.line }]}>
        <Text style={[s.title, { color: c.text }]}>{t("tabs.guide")}</Text>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        >
          <CloseIcon color={c.muted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.body_}>
        <Text style={[s.lede, { color: c.text }]}>
          {plain("guide.phone.intro")}
        </Text>

        <View style={s.section}>
          <Text style={[s.heading, { color: c.text }]}>
            {t("guide.phone.matrixTitle")}
          </Text>
          {QUADS.map((q: Quadrant) => (
            <View
              key={q}
              style={[
                s.quad,
                { borderColor: c.line, backgroundColor: c.panel },
              ]}
            >
              <Text style={[s.quadTag, { color: c.text }]}>
                {plain(`guide.${q}.tag`)}
              </Text>
              <Text style={[s.body, { color: c.muted }]}>
                {plain(`guide.${q}.body`)}
              </Text>
            </View>
          ))}
        </View>

        <Section
          title={t("guide.phone.dumpTitle")}
          lines={[plain("guide.phone.dump"), plain("guide.phone.open")]}
        />
        <Section
          title={t("guide.phone.gesturesTitle")}
          lines={[
            plain("guide.phone.tap"),
            plain("guide.phone.long"),
            plain("guide.phone.unfile"),
            plain("guide.phone.swipe"),
            plain("guide.phone.check"),
          ]}
        />
        <Section
          title={t("guide.phone.spaceTitle")}
          lines={[plain("guide.phone.space")]}
        />
        <Section
          title={t("guide.phone.archiveTitle")}
          lines={[plain("guide.phone.archive")]}
        />
        <Section
          title={t("guide.phone.dataTitle")}
          lines={[plain("guide.phone.data")]}
        />
      </ScrollView>
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
    paddingVertical: SP.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: FS.lg, fontWeight: FW.semibold },
  // `body_` because `body` below is the paragraph style and this is the box.
  body_: { padding: SP["4xl"], gap: SP["5xl"], paddingBottom: SP["7xl"] },
  lede: { fontSize: FS.lg, lineHeight: FS.lg * LH.normal },
  section: { gap: SP.lg },
  heading: { fontSize: FS.md, fontWeight: FW.semibold },
  body: { fontSize: FS.md, lineHeight: FS.md * LH.relaxed },
  quad: {
    gap: SP.xs,
    padding: SP.xl,
    borderRadius: R.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  quadTag: { fontSize: FS.sm, fontWeight: FW.semibold },
});
