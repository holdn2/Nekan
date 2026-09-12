/**
 * Speaking a task instead of typing it.
 *
 * The recogniser runs **on the device**. `requiresOnDeviceRecognition` is set
 * and there is no fallback to the network one, which is a deliberate
 * limitation rather than an oversight: a task list is a list of the things
 * somebody has not done yet, and sending that audio to a server to save a
 * feature on an older phone is not a trade this app gets to make quietly. A
 * device that cannot do it says so and the button stays off.
 *
 * Nothing here submits. The words land in the field the same way typing does,
 * and a person presses the same button to add them -- dictation gets names and
 * numbers wrong often enough that a list which filled itself would be a list
 * of things to go back and fix.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { locale } from "../i18n";
import { composeDictation, hasModelFor, speechLocale } from "./transcript";

/** What the button is doing, which is all the screen needs to know. */
export type DictationState = "off" | "unavailable" | "asking" | "listening";

interface Options {
  /** The field's current text, read when the mic is pressed. */
  textRef: { current: string };
  /** Called with what the field should now show. */
  onText: (text: string) => void;
}

export function useDictation({ textRef, onText }: Options) {
  const [state, setState] = useState<DictationState>("off");
  const [problem, setProblem] = useState<string | null>(null);
  // The text as it stood when the mic was pressed. Every partial result is
  // composed against this rather than against the field, which is already
  // being rewritten by the previous partial.
  const base = useRef("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Three questions, and the third is the one that is easy to miss.
      // `supportsOnDeviceRecognition` answers for the device, not for the
      // language: a phone can do offline recognition and still not have the
      // model for the language this app is in.
      //
      // That gap matters more than an error message. The option's own
      // documentation says "only enabled if the device supports it" and tells
      // you to check getSupportedLocales() first -- so a request that asks for
      // on-device recognition of a language the device has no model for may
      // not fail at all. It may quietly do the other thing, which is send the
      // audio away. The promise this file makes is only as good as this check.
      const [available, onDevice, supported] = await Promise.all([
        ExpoSpeechRecognitionModule.isRecognitionAvailable(),
        ExpoSpeechRecognitionModule.supportsOnDeviceRecognition(),
        ExpoSpeechRecognitionModule.getSupportedLocales({}).catch(() => null),
      ]);
      if (cancelled) return;
      if (!available || !onDevice) return setState("unavailable");
      // A refusal to answer is not an answer of "no". iOS has no notion of
      // installing a model the way Android does, and the call can simply
      // reject; treating that as unavailable would turn the feature off on
      // the platform it works best on. start() still surfaces a real refusal.
      if (!supported) return;
      if (!hasModelFor(speechLocale(locale()), supported.installedLocales)) {
        setState("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Stopping is not instant -- the recogniser finishes the sentence it is on
  // -- so leaving the screen has to abort rather than politely ask.
  useEffect(
    () => () => {
      ExpoSpeechRecognitionModule.abort();
    },
    [],
  );

  useSpeechRecognitionEvent("start", () => setState("listening"));
  useSpeechRecognitionEvent("end", () => {
    setState((s) => (s === "unavailable" ? s : "off"));
  });
  useSpeechRecognitionEvent("result", (event) => {
    const heard = event.results?.[0]?.transcript ?? "";
    onText(composeDictation(base.current, heard));
  });
  useSpeechRecognitionEvent("error", (event) => {
    // "aborted" is this component leaving, and "no-speech" is somebody
    // pressing the mic and changing their mind. Neither is worth a message.
    if (event.error === "aborted" || event.error === "no-speech") return;
    setProblem(event.error);
  });

  const stop = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  const start = useCallback(async () => {
    setProblem(null);
    setState("asking");
    const granted = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted.granted) {
      setState("off");
      setProblem("not-allowed");
      return;
    }
    // Read after the permission round trip, not before: the sheet takes a
    // moment and the field is still live behind it.
    base.current = textRef.current;
    ExpoSpeechRecognitionModule.start({
      lang: speechLocale(locale()),
      interimResults: true,
      requiresOnDeviceRecognition: true,
      // One task at a time. Continuous keeps the microphone open through the
      // pauses between sentences, which here means through the pause where
      // somebody has finished and is reaching for the add button.
      continuous: false,
      addsPunctuation: false,
    });
  }, [textRef]);

  return { state, problem, start, stop };
}
