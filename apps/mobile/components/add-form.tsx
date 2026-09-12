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
 *
 * Speaking goes through the same field. The microphone writes where typing
 * writes and stops there -- see speech/use-dictation.ts for why it does not
 * add the task itself.
 */
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { INBOX } from "@nekan/shared/core";
import type { Place } from "@nekan/shared/types";
import { MicIcon, PlusIcon, StopIcon } from "../icons";
import { t } from "../i18n";
import { FS, R, SP, useColors } from "../theme";
import { addTasks } from "../store/mutations";
import { useDictation } from "../speech/use-dictation";

export function AddForm({ place = INBOX }: { place?: Place }) {
  const c = useColors();
  const [text, setText] = useState("");
  // The dictation hook needs to read the field at the moment the mic is
  // pressed, which is after its own permission round trip -- a stale closure
  // would compose against whatever was there one render ago.
  const textRef = useRef("");
  textRef.current = text;
  const dictation = useDictation({ textRef, onText: setText });
  const listening = dictation.state === "listening";
  const hint =
    place === INBOX ? t("inbox.placeholder") : t("matrix.addPlaceholder");

  const submit = () => {
    if (!text.trim()) return;
    addTasks(place, text);
    setText("");
  };

  const problem =
    dictation.state === "unavailable"
      ? t("speech.unavailable")
      : dictation.problem === "not-allowed"
        ? t("speech.denied")
        : dictation.problem
          ? t("speech.failed")
          : null;

  return (
    <View style={[s.wrap, { borderTopColor: c.line }]}>
      {problem ? (
        <Text style={[s.problem, { color: c.faint }]}>{problem}</Text>
      ) : null}
      <View style={s.row}>
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
          onPress={() =>
            listening ? dictation.stop() : void dictation.start()
          }
          disabled={dictation.state === "unavailable"}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityState={{ busy: listening }}
          accessibilityLabel={listening ? t("speech.stop") : t("speech.start")}
          style={[
            s.mic,
            {
              borderColor: listening ? c.accent : c.line,
              backgroundColor: listening ? c.accent : "transparent",
            },
          ]}
        >
          {listening ? (
            <StopIcon color={c["on-accent"]} size={16} />
          ) : (
            <MicIcon
              color={dictation.state === "unavailable" ? c.disabled : c.faint}
            />
          )}
        </Pressable>
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
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  problem: {
    fontSize: FS.sm,
    paddingHorizontal: SP["4xl"],
    paddingTop: SP.md,
  },
  mic: {
    width: 38,
    height: 38,
    borderRadius: R.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: SP.md,
    paddingHorizontal: SP["4xl"],
    paddingTop: SP.xl,
    paddingBottom: SP["4xl"],
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 110,
    borderRadius: R.panel,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SP.xl,
    paddingVertical: SP.md,
    fontSize: FS.lg,
  },
  add: {
    width: 38,
    height: 38,
    borderRadius: R.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
