/**
 * The one way text gets in.
 *
 * It stays at the bottom of the brain dump rather than floating, because the
 * dump is the only place a task can be typed into -- a quadrant is somewhere
 * you move things to, not somewhere you write. That is the desktop's rule and
 * the reason the dump is shared between the two boards.
 *
 * Multi-line is deliberate: a block pasted from somewhere else becomes one
 * task per line. Submitting is the button, not the return key, because return
 * has to stay available for that.
 */
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { INBOX } from "@nekan/shared/core";
import { PlusIcon } from "../icons";
import { t } from "../i18n";
import { SP, useColors } from "../theme";
import { addTasks } from "../store/mutations";

export function AddForm() {
  const c = useColors();
  const [text, setText] = useState("");

  const submit = () => {
    if (!text.trim()) return;
    addTasks(INBOX, text);
    setText("");
  };

  return (
    <View style={[s.row, { borderTopColor: c.line }]}>
      <TextInput
        style={[
          s.input,
          {
            backgroundColor: c["input-bg"],
            borderColor: c.line,
            color: c.text,
          },
        ]}
        value={text}
        onChangeText={setText}
        placeholder={t("inbox.placeholder")}
        placeholderTextColor={c.faint}
        multiline
        // Korean composition sends its own return; letting the field keep it
        // is why the button submits instead.
        blurOnSubmit={false}
        accessibilityLabel={t("inbox.placeholder")}
      />
      <Pressable
        onPress={submit}
        disabled={!text.trim()}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={t("common.add")}
        style={[
          s.add,
          { backgroundColor: text.trim() ? c.accent : c.disabled },
        ]}
      >
        <PlusIcon color={text.trim() ? c["on-accent"] : c.faint} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: SP.md,
    paddingHorizontal: SP["4xl"],
    paddingTop: SP.xl,
    paddingBottom: SP["4xl"],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 110,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SP.xl,
    paddingVertical: SP.md,
    fontSize: 14,
  },
  add: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
});
