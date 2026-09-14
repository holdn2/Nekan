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
 *
 * The widget opens app/quick.tsx, which reuses this rather than growing a
 * second field: a copy would be the place where the two of them stop agreeing
 * about composition, about when adding is allowed, and about where a task
 * lands. That is what `autoFocus`, `autoSpeak` and `onAdded` are for -- the
 * screen decides how it was entered, and this goes on being the one way text
 * gets in.
 */
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { INBOX } from "@nekan/shared/core";
import type { Place } from "@nekan/shared/types";
import { MicIcon, PlusIcon, StopIcon } from "../icons";
import { t } from "../i18n";
import { FS, R, SP, useColors } from "../theme";
import { addTasks } from "../store/mutations";
import { useDictation } from "../speech/use-dictation";

interface Props {
  place?: Place;
  /** Open the keyboard on mount. */
  autoFocus?: boolean;
  /** Start dictating on mount, once the device has been asked whether it can. */
  autoSpeak?: boolean;
  /** How many tasks the last press added. The screen decides what to say. */
  onAdded?: (count: number) => void;
}

export function AddForm({
  place = INBOX,
  autoFocus = false,
  autoSpeak = false,
  onAdded,
}: Props) {
  const c = useColors();
  const [text, setText] = useState("");
  // The dictation hook needs to read the field at the moment the mic is
  // pressed, which is after its own permission round trip -- a stale closure
  // would compose against whatever was there one render ago.
  const textRef = useRef("");
  textRef.current = text;
  const dictation = useDictation({ textRef, onText: setText });
  const listening = dictation.state === "listening";
  // "asking" counts too. The permission sheet is up, the field is still live
  // behind it, and the text is read the moment it closes -- so a task added in
  // that gap is taken away *and* comes back, because the first result composes
  // against the text that was there when the sheet opened.
  const dictating = dictation.state === "asking" || listening;
  const hint =
    place === INBOX ? t("inbox.placeholder") : t("matrix.addPlaceholder");

  // Adding is off while the microphone is open. The recogniser is still
  // revising the sentence -- every partial result rewrites the field -- so a
  // task added mid-dictation is a task made from half of what was said, and
  // the other half then lands in an empty field with nowhere to go. Stopping
  // is one press, and the button lights up the moment it lands.
  const canAdd = Boolean(text.trim()) && !dictating;

  const submit = () => {
    if (!canAdd) return;
    onAdded?.(addTasks(place, text));
    setText("");
  };

  // Entered by the microphone door on the widget.
  //
  // It waits for the availability probe rather than firing on mount: before
  // that lands, a device that cannot dictate is indistinguishable from one
  // that has simply not been asked, and starting anyway turns a button that
  // would have been disabled into an error message. Once per mount -- the
  // guard is the ref, not the effect's deps, because `state` moves through
  // "asking" and "listening" and a dependency on it would restart the
  // recogniser each time.
  const started = useRef(false);
  useEffect(() => {
    if (!autoSpeak || started.current) return;
    if (!dictation.checked || dictation.state === "unavailable") return;
    started.current = true;
    void dictation.start();
  }, [autoSpeak, dictation.checked, dictation.state, dictation.start]);

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
          autoFocus={autoFocus}
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
          disabled={!canAdd}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t("common.add")}
          style={[s.add, { backgroundColor: canAdd ? c.accent : c.disabled }]}
        >
          <PlusIcon color={canAdd ? c["on-accent"] : c.faint} />
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
