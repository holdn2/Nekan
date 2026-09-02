/**
 * Archive: history and trash under one tab, as two tabs of its own.
 *
 * The outer name is new -- the desktop has no word for "the two together" --
 * but the inner two keep theirs, because the catalogue already fixes them and
 * a screen should not be called one thing on a phone and another on a laptop.
 *
 * Two things are deliberately not the desktop's:
 *
 * The list is virtualised rather than paged. The desktop pages because drawing
 * two thousand rows costs about a third of a second there, and a page is the
 * cheapest way to stop paying it; a phone has SectionList, which draws only
 * what is on screen and keeps scrolling as the way to move. Paging buttons
 * would be a workaround for a cost this platform does not have, made of
 * targets too small to hit.
 *
 * The search still reads the whole list. That is not a performance detail but
 * a correctness one -- a task finished in March has to be findable, and it is
 * nowhere near the part of the list a finger has scrolled to.
 */
import { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { INBOX } from "@nekan/shared/core";
import type { Task } from "@nekan/shared/types";
import { locale, t } from "../../i18n";
import { FS, FW, LH, R, SP, useColors } from "../../theme";
import { doneTasks, search, trashedTasks } from "../../store/selectors";
import {
  purgeAll,
  purgeTask,
  restoreTask,
  deleteTask,
  trashAll,
  untrashAll,
  untrashTask,
} from "../../store/mutations";
import { useStore } from "../../store/use-store";

type Tab = "history" | "trash";

/** What the label on a row means. q4 is "other" here, as on the desktop. */
const QUAD_KEY: Record<string, string> = {
  q1: "archive.quadQ1",
  q2: "archive.quadQ2",
  q3: "archive.quadQ3",
  q4: "archive.quadOther",
};

/**
 * A day, as something cheap to compare.
 *
 * Local getters on purpose: a "day" here is the one the person was in, which
 * is what the header says too.
 */
const dayKey = (ts: number) => {
  const d = new Date(ts);
  return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
};

const dayLabel = (ts: number) =>
  new Date(ts).toLocaleDateString(locale(), {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

const timeLabel = (ts: number) =>
  new Date(ts).toLocaleTimeString(locale(), {
    hour: "2-digit",
    minute: "2-digit",
  });

/** When the row got where it is: finished, or thrown away. */
const stampOf = (task: Task, tab: Tab) =>
  (tab === "history" ? task.completedAt : task.deletedAt) ?? 0;

function group(list: Task[], tab: Tab) {
  // `day` rather than `key`: SectionList has its own `key`, and it is a string.
  const out: { day: number; title: string; data: Task[] }[] = [];
  for (const task of list) {
    const ts = stampOf(task, tab);
    const day = dayKey(ts);
    const last = out[out.length - 1];
    if (last && last.day === day) last.data.push(task);
    else out.push({ day, title: dayLabel(ts), data: [task] });
  }
  return out;
}

export default function ArchiveScreen() {
  const c = useColors();
  useStore();
  const [tab, setTab] = useState<Tab>("history");
  const [query, setQuery] = useState("");

  const all = tab === "history" ? doneTasks() : trashedTasks();
  const rows = search(all, query);
  const sections = useMemo(() => group(rows, tab), [rows, tab]);

  // Bulk acts on what the tab is showing, never on a fresh filter: the list is
  // already scoped to the board on screen, and re-deriving it would sweep up
  // the other board's rows, which are not visible and were never confirmed.
  const confirm = (message: string, label: string, go: () => void) =>
    Alert.alert("", message, [
      { text: t("common.cancel"), style: "cancel" },
      { text: label, style: "destructive", onPress: go },
    ]);

  const emptyHistory = () =>
    confirm(
      t("archive.confirmTrashAll", { count: rows.length }),
      t("history.clearAll"),
      () => trashAll(rows),
    );

  const emptyTrash = () =>
    confirm(
      t("archive.confirmPurgeAll", { count: rows.length }),
      t("trash.empty"),
      () => purgeAll(rows),
    );

  return (
    <SafeAreaView style={[s.root, { backgroundColor: c.bg }]} edges={["top"]}>
      <View style={[s.tabs, { borderBottomColor: c.line }]}>
        {(["history", "trash"] as Tab[]).map((name) => (
          <Pressable key={name} onPress={() => setTab(name)}>
            <Text
              style={[
                s.tab,
                name === tab
                  ? { color: c.text, borderBottomColor: c.accent, ...s.on }
                  : { color: c.muted },
              ]}
            >
              {t(`tabs.${name}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={s.tools}>
        <TextInput
          style={[
            s.search,
            {
              backgroundColor: c["input-bg"],
              borderColor: c.line,
              color: c.text,
            },
          ]}
          value={query}
          onChangeText={setQuery}
          placeholder={t(`${tab}.search`)}
          placeholderTextColor={c.faint}
          accessibilityLabel={t(`${tab}.search`)}
          // The one field on this screen; clearing is a common enough move
          // that the platform's own button is worth having.
          clearButtonMode="while-editing"
        />
        {rows.length > 0 ? (
          <View style={s.bulk}>
            {tab === "trash" ? (
              <Pressable onPress={() => untrashAll(rows)} hitSlop={6}>
                <Text style={[s.bulkText, { color: c.muted }]}>
                  {t("trash.restoreAll")}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={tab === "history" ? emptyHistory : emptyTrash}
              hitSlop={6}
            >
              <Text style={[s.bulkText, { color: c.danger }]}>
                {tab === "history" ? t("history.clearAll") : t("trash.empty")}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(task) => task.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={sections.length ? undefined : s.emptyBox}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text
            style={[
              s.day,
              {
                color: c.faint,
                backgroundColor: c.bg,
                borderBottomColor: c.line,
              },
            ]}
          >
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => <Row task={item} tab={tab} colors={c} />}
        ListEmptyComponent={
          <Text style={[s.empty, { color: c.faint }]}>
            {query.trim()
              ? t("archive.noResults")
              : tab === "history"
                ? t("archive.historyEmpty")
                : t("archive.trashEmpty")}
          </Text>
        }
      />
    </SafeAreaView>
  );
}

function Row({
  task,
  tab,
  colors: c,
}: {
  task: Task;
  tab: Tab;
  colors: ReturnType<typeof useColors>;
}) {
  const quad =
    task.quadrant === INBOX
      ? t("archive.quadInbox")
      : t(QUAD_KEY[task.quadrant] ?? "archive.quadOther");

  const purge = () =>
    Alert.alert("", t("archive.confirmPurgeOne"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("archive.purge"),
        style: "destructive",
        onPress: () => purgeTask(task.id),
      },
    ]);

  return (
    <View style={s.row}>
      <View style={s.rowHead}>
        <Text style={[s.meta, { color: c.faint }]}>
          {timeLabel(stampOf(task, tab))}
        </Text>
        <Text style={[s.meta, { color: c.faint }]} numberOfLines={1}>
          {quad}
        </Text>
      </View>
      <Text style={[s.text, { color: c.text }]}>{task.text}</Text>
      <View style={s.actions}>
        <Pressable
          onPress={() =>
            tab === "history" ? restoreTask(task.id) : untrashTask(task.id)
          }
          hitSlop={6}
        >
          <Text style={[s.action, { color: c.muted }]}>
            {tab === "history" ? t("archive.restore") : t("archive.untrash")}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => (tab === "history" ? deleteTask(task.id) : purge())}
          hitSlop={6}
        >
          <Text style={[s.action, { color: c.danger }]}>
            {tab === "history" ? t("archive.delete") : t("archive.purge")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  tabs: {
    flexDirection: "row",
    gap: SP["5xl"],
    paddingHorizontal: SP["4xl"],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: { paddingVertical: SP.xl, fontSize: FS.lg, fontWeight: FW.semibold },
  on: { borderBottomWidth: 2 },
  tools: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.xl,
    paddingHorizontal: SP["4xl"],
    paddingVertical: SP.xl,
  },
  search: {
    flex: 1,
    minHeight: 38,
    borderRadius: R.panel,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SP.xl,
    paddingVertical: SP.md,
    fontSize: FS.md,
  },
  bulk: { flexDirection: "row", gap: SP.xl },
  bulkText: { fontSize: FS.sm, fontWeight: FW.semibold },
  day: {
    paddingHorizontal: SP["4xl"],
    paddingTop: SP.xl,
    paddingBottom: SP.sm,
    fontSize: FS.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: { paddingHorizontal: SP["4xl"], paddingVertical: SP.xl },
  rowHead: { flexDirection: "row", gap: SP.md, marginBottom: SP["2xs"] },
  meta: { fontSize: FS.xs, fontVariant: ["tabular-nums"] },
  text: { fontSize: FS.lg, lineHeight: FS.lg * LH.snug, fontWeight: FW.light },
  actions: { flexDirection: "row", gap: SP["4xl"], marginTop: SP.md },
  action: { fontSize: FS.sm, fontWeight: FW.semibold },
  emptyBox: { flexGrow: 1, justifyContent: "center" },
  empty: { padding: SP["4xl"], fontSize: FS.xs, textAlign: "center" },
});
