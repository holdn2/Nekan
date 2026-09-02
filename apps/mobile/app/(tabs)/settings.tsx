/**
 * Settings: what this device does, as opposed to what the board holds.
 *
 * Theme and language only, for now. Both are per-device and neither travels
 * over sync -- the desktop keeps them out of it for the same reason, which is
 * that a laptop in a bright room and a phone in bed are not obliged to agree.
 *
 * Each has three options, not two, and the third is the point: "system" is not
 * a default that was picked but the absence of a pick. It has to survive the
 * system changing its mind, so it is stored as `null` rather than resolved
 * once and written down.
 */
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ChevronIcon } from "../../icons";
import { SUPPORTED } from "@nekan/shared/i18n/locales";
import { applyLanguage, t } from "../../i18n";
import { FS, FW, R, SP, useColors } from "../../theme";
import {
  languageChoice,
  setLanguageChoice,
  setThemeChoice,
  themeChoice,
  type ThemeChoice,
} from "../../store/state";
import { useStore } from "../../store/use-store";

/** One row of choices. Three is small enough that a list beats a picker. */
function Choices<T extends string | null>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onPick: (v: T) => void;
}) {
  const c = useColors();
  return (
    <View style={s.block}>
      <Text style={[s.label, { color: c.muted }]}>{label}</Text>
      <View style={[s.group, { backgroundColor: c["panel-2"] }]}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value ?? "system"}
              onPress={() => onPick(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={[
                s.option,
                on ? ({ backgroundColor: c.accent } as ViewStyle) : null,
              ]}
            >
              <Text
                style={[s.optionText, { color: on ? c["on-accent"] : c.muted }]}
                numberOfLines={1}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const c = useColors();
  useStore();

  return (
    <SafeAreaView style={[s.root, { backgroundColor: c.bg }]} edges={["top"]}>
      <ScrollView contentContainerStyle={s.body}>
        <Text style={[s.title, { color: c.text }]}>{t("settings.title")}</Text>

        <Choices<ThemeChoice>
          label={t("settings.theme")}
          value={themeChoice()}
          onPick={setThemeChoice}
          options={[
            { value: null, label: t("settings.followSystem") },
            { value: "light", label: t("settings.themeLight") },
            { value: "dark", label: t("settings.themeDark") },
          ]}
        />

        <Choices<string | null>
          label={t("settings.language")}
          value={languageChoice()}
          // The store holds the choice and i18next holds the language; both
          // have to move, and the store is what makes the screen redraw.
          onPick={(lang) => {
            applyLanguage(lang);
            setLanguageChoice(lang);
          }}
          options={[
            { value: null, label: t("settings.followSystem") },
            ...SUPPORTED.map((lang) => ({
              value: lang as string,
              label: t(`language.${lang}`),
            })),
          ]}
        />
        {/* A route rather than a section here: the guide is a document, and
            one that can be left reads better than one that pushes the settings
            it was opened from off the bottom. */}
        <Pressable
          onPress={() => router.push("/guide")}
          accessibilityRole="link"
          style={[s.link, { borderColor: c.line, backgroundColor: c.panel }]}
        >
          <Text style={[s.linkText, { color: c.text }]}>{t("tabs.guide")}</Text>
          <ChevronIcon color={c.faint} size={16} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: SP["4xl"], gap: SP["5xl"] },
  title: { fontSize: FS["3xl"], fontWeight: FW.semibold },
  block: { gap: SP.md },
  label: { fontSize: FS.sm, fontWeight: FW.semibold },
  // One track with a filled cell, the way the desktop's switch reads. No
  // sliding pill here: that one is exactly two wide by construction, and this
  // is three.
  group: {
    flexDirection: "row",
    borderRadius: R.panel,
    padding: SP["2xs"],
    gap: SP["2xs"],
  },
  option: {
    flex: 1,
    alignItems: "center",
    paddingVertical: SP.lg,
    borderRadius: R.md,
  },
  optionText: { fontSize: FS.md, fontWeight: FW.medium },
  link: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SP.xl,
    borderRadius: R.panel,
    borderWidth: StyleSheet.hairlineWidth,
  },
  linkText: { fontSize: FS.md, fontWeight: FW.medium },
});
