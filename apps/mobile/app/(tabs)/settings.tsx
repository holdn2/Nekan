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
import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { router } from "expo-router";
import { ChevronIcon } from "../../icons";
import { SUPPORTED } from "@nekan/shared/i18n/locales";
import { applyLanguage, t } from "../../i18n";
import { exportBoard, type Format } from "../../export";
import { AccountBlock, LeaveAccountLink } from "../../components/account";
import { FS, FW, R, SP, useColors, useThemeName } from "../../theme";
import {
  languageChoice,
  redraw,
  setLanguageChoice,
  setThemeChoice,
  themeChoice,
  type ThemeChoice,
} from "../../store/state";
import { useStore } from "../../store/use-store";
import { useSlidingKnob } from "../../components/sliding-knob";

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
  const dark = useThemeName() === "dark";
  // theme.ts SHADOW.even, "0 0 3px" at 18% / 50%: RN takes the blur as a
  // radius, so half of it. The colour is the palette's darkest ink in each
  // theme (text on light, the ground on dark) rather than a black written
  // here -- theme.ts is the one home for colours (tools/check-colors.js).
  const knob = {
    backgroundColor: c.panel,
    shadowColor: dark ? c.bg : c.text,
    shadowOpacity: dark ? 0.5 : 0.18,
    shadowRadius: 1.5,
    shadowOffset: { width: 0, height: 0 },
  } as ViewStyle;
  const slide = useSlidingKnob(options.findIndex((o) => o.value === value));
  return (
    <View style={s.block}>
      <Text style={[s.label, { color: c.muted }]}>{label}</Text>
      <View style={[s.group, { backgroundColor: c["panel-2"] }]}>
        {slide.knob([knob, s.knob])}
        {options.map((o, i) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value ?? "system"}
              onPress={() => onPick(o.value)}
              onLayout={slide.onOptionLayout(i)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={s.option}
            >
              <Text
                style={[s.optionText, { color: on ? c.text : c.muted }]}
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
  // Building the document and writing it takes long enough on a big board to
  // press twice, and two share sheets is a state nothing recovers from well.
  const [busy, setBusy] = useState(false);

  const send = async (format: Format) => {
    if (busy) return;
    setBusy(true);
    try {
      if (!(await exportBoard(format))) {
        Alert.alert("", t("settings.exportUnavailable"));
      }
    } catch {
      // The person asked for a file and did not get one; which library gave
      // up on the way is not something they can act on.
      Alert.alert("", t("settings.exportFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[s.root, { backgroundColor: c.bg }]}>
      {/* The development sign-in fields are at the bottom of this list. */}
      <ScrollView
        contentContainerStyle={s.body}
        automaticallyAdjustKeyboardInsets
      >
        <Text style={[s.title, { color: c.text }]}>{t("settings.title")}</Text>

        <AccountBlock />

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
          // Two places hold this: the store has the choice, i18next has the
          // language. Either can move without the other -- picking "system"
          // again after the device changed its mind moves only the language,
          // and `setLanguageChoice` returns early on an unchanged value -- so
          // the redraw is asked for on its own rather than as a side effect.
          onPick={(lang) => {
            if (applyLanguage(lang)) redraw();
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
        <View style={s.block}>
          <Text style={[s.label, { color: c.muted }]}>
            {t("settings.export")}
          </Text>
          <View style={s.row}>
            {(["pdf", "html", "md"] as Format[]).map((f) => (
              <Pressable
                key={f}
                onPress={() => send(f)}
                disabled={busy}
                style={[
                  s.format,
                  { borderColor: c.line, backgroundColor: c.panel },
                  busy ? s.off : null,
                ]}
                accessibilityRole="button"
              >
                <Text style={[s.formatText, { color: c.text }]}>
                  {f.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* A route rather than a section here: the guide is a document, and
            one that can be left reads better than one that pushes the settings
            it was opened from off the bottom. */}
        <Pressable
          onPress={() => router.push("/guide")}
          accessibilityRole="link"
          style={[s.link, { borderColor: c.line, backgroundColor: c.panel }]}
        >
          <Text style={[s.linkText, { color: c.text }]}>{t("tabs.guide")}</Text>
          <ChevronIcon color={c.muted} />
        </Pressable>

        <LeaveAccountLink />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: SP["4xl"], gap: SP["5xl"] },
  title: { fontSize: FS["3xl"], fontWeight: FW.semibold },
  block: { gap: SP.md },
  label: { fontSize: FS.sm, fontWeight: FW.semibold },
  // The desktop's switch (styles/switch.css): a pill track in panel-2 and the
  // chosen option as a panel-coloured pill with the "even" shadow, its label in
  // text colour. It used to be a cell filled with the accent, which read as a
  // different control from the desktop's (2026-10-01). It slides between
  // options as the desktop's does (components/sliding-knob.tsx). Taller than
  // the desktop's for a thumb.
  group: {
    flexDirection: "row",
    borderRadius: R.pill,
    padding: SP["2xs"],
  },
  option: {
    flex: 1,
    alignItems: "center",
    paddingVertical: SP.lg,
    borderRadius: R.pill,
  },
  optionText: { fontSize: FS.sm, fontWeight: FW.medium },
  knob: { top: SP["2xs"], bottom: SP["2xs"], borderRadius: R.pill },
  link: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SP.xl,
    borderRadius: R.panel,
    borderWidth: StyleSheet.hairlineWidth,
  },
  linkText: { fontSize: FS.md, fontWeight: FW.medium },
  row: { flexDirection: "row", gap: SP.md },
  format: {
    flex: 1,
    alignItems: "center",
    paddingVertical: SP.lg,
    borderRadius: R.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  off: { opacity: 0.4 },
  formatText: { fontSize: FS.sm, fontWeight: FW.semibold },
});
