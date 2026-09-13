/**
 * The screen the home-screen widget opens.
 *
 * A route of its own rather than the matrix with the keyboard up, because the
 * widget's whole argument is that capturing a task should not cost the four
 * taps it takes to get here by hand. Landing on the board would put the board
 * between the thought and the field again.
 *
 * `mode` says which door was tapped: `voice` starts dictating, `text` opens
 * the keyboard. Anything else -- including no `mode` at all -- opens the
 * keyboard, so a link typed or shared by hand still does something sensible.
 *
 * What is written here goes to the brain dump, always. It is the one place
 * that does not ask where a task belongs, and deciding that is a separate act
 * from remembering it -- which is the same reason the dump exists at all.
 *
 * It does not close after one task. Somebody who opened this to say one thing
 * often says three, and a screen that vanished after the first would make the
 * second cost more than it did before the widget existed.
 */
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { INBOX } from "@nekan/shared/core";
import { AddForm } from "../components/add-form";
import { CloseIcon } from "../icons";
import { t } from "../i18n";
import { FS, FW, SP, useColors } from "../theme";
import { useStore } from "../store/use-store";

export default function QuickScreen() {
  const c = useColors();
  // The form writes into the store, and the confirmation below has to survive
  // the redraw that follows.
  useStore();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [added, setAdded] = useState(false);

  const speaking = mode === "voice";

  // Opened from the widget there is no back stack, so `back()` would have
  // nowhere to go. Falling through to the matrix is also the more useful
  // answer: somebody who has just written three things down is one tap from
  // seeing them.
  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  return (
    <SafeAreaView style={[s.root, { backgroundColor: c.bg }]} edges={["top"]}>
      <View style={[s.bar, { borderBottomColor: c.line }]}>
        <Text style={[s.title, { color: c.text }]} numberOfLines={1}>
          {t("quick.title")}
        </Text>
        <Pressable
          onPress={close}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        >
          <CloseIcon color={c.muted} />
        </Pressable>
      </View>

      <View style={s.body}>
        {added ? (
          <Text style={[s.added, { color: c.faint }]}>{t("quick.added")}</Text>
        ) : null}
      </View>

      <AddForm
        place={INBOX}
        autoFocus={!speaking}
        autoSpeak={speaking}
        onAdded={() => setAdded(true)}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SP.xl,
    paddingHorizontal: SP["4xl"],
    paddingVertical: SP.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    flex: 1,
    fontSize: FS.xl,
    fontWeight: FW.semibold,
  },
  // The form sits at the bottom where it does everywhere else, so this holds
  // the space above it open rather than letting the two meet in the middle.
  body: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: SP["4xl"],
    paddingBottom: SP.xl,
  },
  added: {
    fontSize: FS.sm,
  },
});
