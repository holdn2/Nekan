/**
 * The one way text gets in.
 *
 * It follows whichever list is open, so a quadrant can be written into
 * directly. The desktop gives every quadrant a field of its own for the same
 * reason: deciding where something goes and writing it down are not always two
 * separate moments.
 *
 * Where it lands still decides what it belongs to. Typed into the dump, a task
 * has no board yet; typed into a quadrant, it takes the one on screen -- and
 * that is `spaceFor`'s job, not this file's.
 *
 * Multi-line is deliberate: a block pasted from somewhere else becomes one
 * task per line. Submitting is the button, not the return key, because return
 * has to stay available for that.
 */
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { INBOX } from "@nekan/shared/core";
import type { Place } from "@nekan/shared/types";
import { PlusIcon } from "../icons";
import { t } from "../i18n";
import { SP, useColors } from "../theme";
import { addTasks } from "../store/mutations";

export function AddForm({ place = INBOX }: { place?: Place }) {
  const c = useColors();
  const [text, setText] = useState("");
  const hint =
    place === INBOX ? t("inbox.placeholder") : t("matrix.addPlaceholder");

  const submit = () => {
    if (!text.trim()) return;
    addTasks(place, text);
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
        placeholder={hint}
        placeholderTextColor={c.faint}
        multiline
        // Korean composition sends its own return; letting the field keep it
        // is why the button submits instead.
        blurOnSubmit={false}
        accessibilityLabel={hint}
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
