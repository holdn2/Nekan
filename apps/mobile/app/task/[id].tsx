/**
 * One task, opened.
 *
 * A route rather than a sheet inside the matrix screen, because the widget
 * will need to open a task directly one day and a route already has a URL.
 *
 * Edits are saved as they are made rather than on a Save button. There is
 * nothing to cancel back to -- the store is the document, every write is
 * already a timestamped row, and a phone that is closed mid-sentence should
 * not lose the sentence. The date is saved the instant it is picked; text and
 * note a second after typing stops, on blur, when the app goes to the
 * background, and when the screen goes away however it goes (issue 136).
 *
 * A brain-dump row gets only its text. It has no board yet, and a due date or
 * a note on something not yet classified is a decision made in the wrong
 * order -- the desktop draws those rows the same way.
 */
import { useEffect, useRef, useState } from "react";
import {
  AppState,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import {
  DRAFT_SAVE_MS,
  INBOX,
  QUADS,
  dueInfo,
  formatDue,
} from "@nekan/shared/core";
import { isBuried } from "@nekan/shared/sync";
import type { Quadrant } from "@nekan/shared/types";
import { CloseIcon } from "../../icons";
import { DueCalendar } from "../../components/due-calendar";
import { locale, t } from "../../i18n";
import { FS, FW, LH, R, SP, useColors } from "../../theme";
import { findTask } from "../../store/state";
import { useStore } from "../../store/use-store";
import {
  deleteTask,
  editTask,
  moveToTop,
  setDue,
  setMemo,
} from "../../store/mutations";

/** Today, tomorrow, a week out -- the shortcuts. Any other day is picked from the month (DueCalendar). */
const OFFSETS = [
  [0, "due.today"],
  [1, "due.tomorrow"],
  [7, "due.nextWeek"],
] as const;

function isoIn(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * How long the bar says "saved" for. The desktop's note panel waits the same
 * amount for the same reason -- long enough to catch, short enough to be gone
 * before the next pause.
 */
const SAID_MS = 2000;
/** Nothing owed · a pause is owed · one just wrote. */
type Status = "idle" | "saving" | "saved";

export default function TaskScreen() {
  const c = useColors();
  useStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const task = findTask(String(id));
  const [text, setText] = useState(task?.text ?? "");
  const [memo, setMemoDraft] = useState(task?.memo ?? "");
  // Whether the month is open. Closed by default: three chips answer most due
  // dates in one tap, and a calendar that is always up would push the note off
  // a short screen to serve the rarer half.
  const [picking, setPicking] = useState(false);

  // Blur and the close button were the only moments these were written, and
  // neither is promised: a swipe back does not blur the field first, and iOS
  // can end a backgrounded app without saying so. So the fields also write a
  // second after typing stops, when the app leaves the foreground, and when
  // this screen unmounts.
  //
  // None of those ever writes an empty field. A blank title deletes the task
  // (editTask), and a pause after clearing it to type a new one is not a
  // decision to delete. Blur and the close button no longer write a blank
  // title either -- a device showed that clearing one and leaving deleted the
  // task, so leaving puts the stored title back. They do still write a blank
  // note: emptying it and closing is how a note comes off a task.
  //
  // And nothing writes a field nobody typed into. The two fields are copies
  // taken when the screen opened, and a sync can change the task underneath
  // them; writing an untouched copy back would stamp the old words as the
  // newest and erase the other device's edit everywhere. Blur and the close
  // button always had that gap -- they keep the same rule now.
  //
  // A write clears its flag. Once saved, the copy is no newer than the store,
  // and writing it again on the next unmount or trip to the background would
  // put it back over whatever a sync brought in meanwhile. A write the blank
  // guard skipped leaves the flag up, and that is harmless: no road writes a
  // blank title, and a blank note is only written by a deliberate blur or
  // close.
  const edited = useRef({ text: false, memo: false });
  // What the bar says about what has been typed -- the same two words the
  // desktop's note panel shows, for a sharper reason here: this screen can go
  // away by a swipe from the edge, and "saved" is how someone knows the swipe
  // was safe. The write is instant; the second of waiting is the pause itself.
  const [status, setStatus] = useState<Status>("idle");
  const linger = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useRef((next: Status) => {
    if (linger.current) {
      clearTimeout(linger.current);
      linger.current = null;
    }
    setStatus(next);
    if (next === "saved")
      linger.current = setTimeout(() => setStatus("idle"), SAID_MS);
  });
  useEffect(
    () => () => {
      if (linger.current) clearTimeout(linger.current);
    },
    [],
  );
  const latest = useRef({ text, memo });
  latest.current = { text, memo };
  const taskId = task?.id;
  // A sync can purge the task while this screen is open. A tombstone holds no
  // words, so nothing here writes into one.
  const gone = () => {
    const row = taskId ? findTask(taskId) : undefined;
    return !row || isBuried(row);
  };
  const flush = useRef(() => {});
  flush.current = () => {
    if (!taskId || gone()) return;
    // Nothing owed, nothing to say. A leave writes and says "saved", and the
    // pause timer typing started is still running after it -- a blur does not
    // change the text -- so without this that timer, or a trip to the
    // background, came along a moment later and wiped the receipt to idle.
    if (!edited.current.text && !edited.current.memo) return;
    const typed = latest.current;
    let wrote = false;
    // The write is called first, then `wrote` -- the other order would skip
    // the second field once the first had written.
    if (edited.current.text && typed.text.trim()) {
      wrote = editTask(taskId, typed.text) || wrote;
      edited.current.text = false;
    }
    if (edited.current.memo && typed.memo.trim()) {
      wrote = setMemo(taskId, typed.memo) || wrote;
      edited.current.memo = false;
    }
    // "Saved" only for a write that happened. Nothing written means nothing
    // is owed either: the field is blank, or it says exactly what is stored
    // (typed and then typed back), and a receipt for either would be a lie.
    say.current(wrote ? "saved" : "idle");
  };
  // The flags, not the mutations' own "nothing changed" checks, are what keep
  // the first run of this on mount from writing: a copy gone stale under a
  // sync is not "nothing changed".
  useEffect(() => {
    const timer = setTimeout(() => flush.current(), DRAFT_SAVE_MS);
    return () => clearTimeout(timer);
  }, [text, memo]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") flush.current();
    });
    return () => {
      sub.remove();
      flush.current();
    };
  }, []);

  // Deleted from under us -- by a swipe on the list behind, or later by sync.
  // Purged counts: there is nothing left on a tombstone to edit.
  if (!task || isBuried(task)) {
    router.back();
    return null;
  }

  // Both fields save on blur, and tapping the close button is not guaranteed
  // to blur one first -- so closing writes them itself. Only a field that was
  // typed into, and not yet written, for the reason given above.
  const close = () => {
    if (!gone()) {
      // Blank is not a deletion -- see the title's blur handler. The note is
      // different: emptying it and closing is how a note is taken off a task,
      // and nothing is lost that the task itself was not.
      if (edited.current.text && text.trim()) editTask(task.id, text);
      if (edited.current.memo) setMemo(task.id, memo);
    }
    edited.current = { text: false, memo: false };
    router.back();
  };

  const inDump = task.quadrant === INBOX;
  const due = formatDue(dueInfo(task.dueDate, new Date()), t, locale());

  return (
    <SafeAreaView style={[s.root, { backgroundColor: c.bg }]} edges={["top"]}>
      <View style={[s.bar, { borderBottomColor: c.line }]}>
        <Text style={[s.title, { color: c.muted }]} numberOfLines={1}>
          {inDump ? t("inbox.title") : t(`quad.${task.quadrant}.action`)}
        </Text>
        {/* Beside the close button, because that is where the eye already is
            when someone is deciding whether it is safe to leave. */}
        {status === "idle" ? null : (
          <Text style={[s.status, { color: c.faint }]}>
            {status === "saving" ? t("common.saving") : t("common.saved")}
          </Text>
        )}
        <Pressable
          onPress={close}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        >
          <CloseIcon color={c.muted} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={s.body}
        // Not "on-drag" any more: with the keyboard up, scrolling down to
        // reach the delete button took the keyboard away with it, and the
        // scroll went with the keyboard. It goes when something that is not a
        // field is tapped instead -- which is what "handled" means here: a tap
        // a child takes (a chip, the delete button) leaves the keyboard alone,
        // and a tap on anything else puts it away.
        keyboardShouldPersistTaps="handled"
        // The note is the last field on a screen that scrolls, so the keyboard
        // covered it on a short phone. iOS gives a scroll view the inset for
        // free; the alternative is wrapping this in a KeyboardAvoidingView,
        // which fights the scrolling this screen already does.
        automaticallyAdjustKeyboardInsets
      >
        <TextInput
          style={[
            s.text,
            { backgroundColor: c.panel, borderColor: c.line, color: c.text },
          ]}
          value={text}
          onChangeText={(next) => {
            edited.current.text = true;
            say.current("saving");
            setText(next);
          }}
          onBlur={() => {
            if (!edited.current.text || gone()) return;
            // A blank title is never written, by any road. Writing one deletes
            // the task (editTask), and clearing the field is how someone
            // starts rewriting a title -- not how they ask for the task to go.
            // Reported from a device: the pause already refused to write it,
            // but leaving the field still did. Deleting is the button at the
            // bottom of this screen, and the swipe on the list behind it.
            if (!text.trim()) {
              setText(task.text);
              edited.current.text = false;
              say.current("idle");
              return;
            }
            const changed = editTask(task.id, text);
            edited.current.text = false;
            say.current(changed ? "saved" : "idle");
          }}
          multiline
          accessibilityLabel={t("common.save")}
        />

        {inDump ? (
          <Text style={[s.note, { color: c.faint }]}>{t("inbox.shared")}</Text>
        ) : (
          <>
            <Text style={[s.label, { color: c.muted }]}>{t("due.field")}</Text>
            <View style={s.chips}>
              {OFFSETS.map(([days, key]) => (
                <Pressable
                  key={key}
                  onPress={() => setDue(task.id, isoIn(days))}
                  style={[
                    s.chip,
                    { backgroundColor: c.panel, borderColor: c.line },
                  ]}
                >
                  <Text style={[s.chipText, { color: c.text }]}>{t(key)}</Text>
                </Pressable>
              ))}
              {/* Any other day. The three above are shortcuts through this,
                  not the whole of what a due date can be. */}
              <Pressable
                onPress={() => setPicking((up) => !up)}
                accessibilityRole="button"
                accessibilityState={{ expanded: picking }}
                style={[
                  s.chip,
                  {
                    backgroundColor: picking ? c.accent : c.panel,
                    borderColor: picking ? c.accent : c.line,
                  },
                ]}
              >
                <Text
                  style={[
                    s.chipText,
                    { color: picking ? c["on-accent"] : c.text },
                  ]}
                >
                  {t("due.pickDate")}
                </Text>
              </Pressable>
              {task.dueDate ? (
                <Pressable
                  onPress={() => setDue(task.id, null)}
                  style={[
                    s.chip,
                    { backgroundColor: c.panel, borderColor: c.line },
                  ]}
                >
                  <Text style={[s.chipText, { color: c.muted }]}>
                    {t("common.clear")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            {picking ? (
              <DueCalendar
                value={task.dueDate}
                // Picking is one decision, so the month closes behind it. The
                // chip stays to open it again, and what was picked is written
                // the instant it is tapped -- a date has no half-typed state
                // to protect, which is why it never waited for a pause.
                onPick={(iso) => {
                  setDue(task.id, iso);
                  setPicking(false);
                }}
              />
            ) : null}
            {due ? (
              <Text style={[s.note, { color: c.muted }]}>{due.text}</Text>
            ) : null}

            <Text style={[s.label, { color: c.muted }]}>{t("memo.panel")}</Text>
            <TextInput
              style={[
                s.memo,
                {
                  backgroundColor: c.panel,
                  borderColor: c.line,
                  color: c.text,
                },
              ]}
              value={memo}
              onChangeText={(next) => {
                edited.current.memo = true;
                say.current("saving");
                setMemoDraft(next);
              }}
              onBlur={() => {
                if (!edited.current.memo || gone()) return;
                const changed = setMemo(task.id, memo);
                edited.current.memo = false;
                say.current(changed ? "saved" : "idle");
              }}
              placeholder={t("memo.placeholder")}
              placeholderTextColor={c.faint}
              multiline
              textAlignVertical="top"
            />

            <Text style={[s.label, { color: c.muted }]}>
              {t("matrix.move")}
            </Text>
            <View style={s.chips}>
              {QUADS.filter((q: Quadrant) => q !== task.quadrant).map(
                (q: Quadrant) => (
                  <Pressable
                    key={q}
                    onPress={() => moveToTop(task.id, q)}
                    style={[
                      s.chip,
                      { backgroundColor: c.panel, borderColor: c.line },
                    ]}
                  >
                    <View style={[s.dot, { backgroundColor: c[q] }]} />
                    <Text style={[s.chipText, { color: c.text }]}>
                      {t(`quad.${q}.action`)}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>
          </>
        )}

        <Pressable
          onPress={() => {
            deleteTask(task.id);
            router.back();
          }}
          style={[s.delete, { borderColor: c.danger }]}
          accessibilityRole="button"
        >
          <Text style={[s.deleteText, { color: c.danger }]}>
            {t("common.delete")}
          </Text>
        </Pressable>
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
    gap: SP.xl,
    paddingHorizontal: SP["4xl"],
    paddingVertical: SP.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // Takes the slack, so the status and the close button stay at the right
  // edge rather than being spaced out across the bar.
  title: { fontSize: FS.md, fontWeight: FW.semibold, flex: 1 },
  status: { fontSize: FS.xs },
  body: { padding: SP["4xl"], gap: SP.xl, paddingBottom: SP["7xl"] },
  text: {
    minHeight: 64,
    borderRadius: R.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SP["3xl"],
    fontSize: FS.xl,
    // iOS needs this said out loud for a multiline field; Android measures it
    // for itself and setting it there crops the text. The number comes from
    // the scale either way.
    ...Platform.select({
      ios: { lineHeight: FS.xl * LH.snug },
      default: {},
    }),
  },
  label: { fontSize: FS.sm, fontWeight: FW.semibold, marginTop: SP.lg },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SP.md },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.md,
    paddingHorizontal: SP["3xl"],
    paddingVertical: SP.lg,
    borderRadius: R.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: FS.md },
  dot: { width: 8, height: 8, borderRadius: R.pill },
  note: { fontSize: FS.sm },
  memo: {
    minHeight: 120,
    borderRadius: R.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SP["3xl"],
    fontSize: FS.lg,
  },
  delete: {
    marginTop: SP["5xl"],
    alignSelf: "flex-start",
    paddingHorizontal: SP["4xl"],
    paddingVertical: SP.lg,
    borderRadius: R.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  deleteText: { fontSize: FS.md, fontWeight: FW.semibold },
});
