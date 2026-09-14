/**
 * The screen the widget opens, from the lock screen or the home screen.
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
 * Adding hands over to the app, onto the brain dump with the new row in view.
 * The first version stayed open for another task instead, on the guess that
 * somebody who says one thing says three; the person using it asked for the
 * opposite -- "입력 완료하면 앱 내부로 들어가고" -- and seeing the task land is
 * also the only confirmation that it did. A second task is one more tap on the
 * field that is already there.
 */
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
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
  useStore();
  const { mode } = useLocalSearchParams<{ mode?: string }>();

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

      {/* The keyboard opens the moment this screen does, and the field is at
          the bottom -- so without this the keyboard lands on top of the one
          thing on the screen, which is how it was first reported. */}
      <KeyboardAvoidingView
        style={s.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* The empty space is where a thumb goes to put the keyboard away, the
          same as the bare parts of the matrix. */}
        <Pressable
          style={s.body}
          onPress={() => Keyboard.dismiss()}
          accessible={false}
        />

        <AddForm
          place={INBOX}
          autoFocus={!speaking}
          autoSpeak={speaking}
          // `replace`, not `push`: back from the board must not return to a
          // capture screen whose task is already written. The value is fresh each
          // time so the board reveals again even if it was still mounted.
          onAdded={() =>
            router.replace({
              pathname: "/",
              params: { reveal: String(Date.now()) },
            })
          }
        />
      </KeyboardAvoidingView>
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
  fill: {
    flex: 1,
  },
  body: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: SP["4xl"],
    paddingBottom: SP.xl,
  },
});
