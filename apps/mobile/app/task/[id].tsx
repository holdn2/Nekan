/**
 * One task, opened.
 *
 * A route rather than a sheet inside the matrix screen, because the widget
 * will need to open a task directly one day and a route already has a URL.
 *
 * Edits are saved as they are made rather than on a Save button. There is
 * nothing to cancel back to -- the store is the document, every write is
 * already a timestamped row, and a phone that is closed mid-sentence should
 * not lose the sentence. The three fields each stop at their own moment:
 * text and note on blur, the date the instant it is picked.
 *
 * A brain-dump row gets only its text. It has no board yet, and a due date or
 * a note on something not yet classified is a decision made in the wrong
 * order -- the desktop draws those rows the same way.
 */
import { useState } from "react";
import {
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
import { INBOX, QUADS, dueInfo, formatDue } from "@nekan/shared/core";
import type { Quadrant } from "@nekan/shared/types";
import { CloseIcon } from "../../icons";
import { locale, t } from "../../i18n";
import { FS, FW, R, SP, useColors } from "../../theme";
import { findTask } from "../../store/state";
import { useStore } from "../../store/use-store";
import {
  deleteTask,
  editTask,
  moveToTop,
  setDue,
  setMemo,
} from "../../store/mutations";

/** Today, tomorrow, a week out -- and clearing it. No calendar yet. */
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

export default function TaskScreen() {
  const c = useColors();
  useStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const task = findTask(String(id));
  const [text, setText] = useState(task?.text ?? "");
  const [memo, setMemoDraft] = useState(task?.memo ?? "");

  // Deleted from under us -- by a swipe on the list behind, or later by sync.
  if (!task) {
    router.back();
    return null;
  }

  // Both fields save on blur, and tapping the close button is not guaranteed
  // to blur one first -- so closing writes them itself. Both are no-ops when
  // nothing changed, so this cannot manufacture an edit.
  const close = () => {
    editTask(task.id, text);
    setMemo(task.id, memo);
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
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <TextInput
          style={[
            s.text,
            { backgroundColor: c.panel, borderColor: c.line, color: c.text },
          ]}
          value={text}
          onChangeText={setText}
          onBlur={() => editTask(task.id, text)}
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
              onChangeText={setMemoDraft}
              onBlur={() => setMemo(task.id, memo)}
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
  title: { fontSize: FS.md, fontWeight: FW.semibold, flexShrink: 1 },
  body: { padding: SP["4xl"], gap: SP.xl, paddingBottom: SP["7xl"] },
  text: {
    minHeight: 64,
    borderRadius: R.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SP["3xl"],
    fontSize: FS.xl,
    ...Platform.select({ ios: { lineHeight: 22 }, default: {} }),
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
