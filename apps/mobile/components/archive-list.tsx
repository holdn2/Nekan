/**
 * History or trash: one list of finished or thrown-away tasks.
 *
 * Each is a tab of its own (app/(tabs)/history.tsx, trash.tsx), as on the
 * desktop. They were once two inner tabs under one "보관함" tab; split on
 * 2026-10-04 because the two are visited for different reasons and a tab
 * inside a tab hid the second one.
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
 *
 * What is drawn grows as the finger nears the end, PAGE rows at a time; the
 * list and the search are both the device's own. Fetching history from the
 * server instead was asked about (2026-10-04) and not done: every finished
 * task is already on the phone -- sync keeps all rows -- so a server query
 * would make the screen depend on a network without making the phone hold
 * less, and filtering a few thousand titles costs milliseconds. The day that
 * changes is the day data.json itself grows heavy (every save rewrites it
 * whole; tens of thousands of rows), and the answer then is to keep old
 * finished rows on the server only -- with a query, a cache, and a line saying
 * the rest cannot load offline.
 */
import { useMemo, useRef, useState } from "react";
import {
  Alert,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { INBOX } from "@nekan/shared/core";
import type { Task } from "@nekan/shared/types";
import { locale, t } from "../i18n";
import { FS, FW, LH, R, SP, useColors, useThemeName } from "../theme";
import { doneTasks, search, trashedTasks } from "../store/selectors";
import {
  purgeAll,
  purgeTask,
  restoreTask,
  deleteTask,
  trashAll,
  untrashAll,
  untrashTask,
} from "../store/mutations";
import { useStore } from "../store/use-store";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { ChevronIcon } from "../icons";

export type Tab = "history" | "trash";

/** Rows drawn at first, and added each time the end comes near. */
const PAGE = 40;

/** Scrolled less than this, the top is in reach and the button stays away. */
const TOP_ZONE = 400;

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

export function ArchiveList({ tab }: { tab: Tab }) {
  const c = useColors();
  const dark = useThemeName() === "dark";
  useStore();
  const [query, setQuery] = useState("");

  const all = tab === "history" ? doneTasks() : trashedTasks();
  const rows = search(all, query);
  const [shown, setShown] = useState(PAGE);
  const visible = rows.length > shown ? rows.slice(0, shown) : rows;
  const sections = useMemo(() => group(visible, tab), [visible, tab]);
  const more = () => {
    if (shown < rows.length) setShown((n) => n + PAGE);
  };

  // Back to the top, offered only while the list is being moved up: that is
  // the moment somebody is heading there, and a button that sat over the rows
  // all the time would cover the last one's actions.
  const list = useRef<SectionList<Task>>(null);
  const lastY = useRef(0);
  const [upward, setUpward] = useState(false);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastY.current;
    lastY.current = y;
    // Near the top there is nowhere to go; small moves are a resting finger.
    const next =
      y < TOP_ZONE ? false : dy < -4 ? true : dy > 4 ? false : upward;
    if (next !== upward) setUpward(next);
  };
  // A new search starts from the top of its results: the count drawn goes
  // back to one page in the same render, and the list goes back up -- left
  // where it was, a search typed far down showed the middle of its results.
  const search_ = (next: string) => {
    setQuery(next);
    setShown(PAGE);
    list.current?.getScrollResponder()?.scrollTo({ y: 0, animated: false });
  };

  const toTop = () => {
    list.current?.getScrollResponder()?.scrollTo({ y: 0, animated: true });
    setUpward(false);
  };

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
    <View style={[s.root, { backgroundColor: c.bg }]}>
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
          onChangeText={search_}
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
        ref={list}
        onScroll={onScroll}
        scrollEventThrottle={16}
        sections={sections}
        keyExtractor={(task) => task.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={sections.length ? undefined : s.emptyBox}
        stickySectionHeadersEnabled={false}
        onEndReached={more}
        // Half a screen early, so the next rows are there before the finger
        // reaches the bottom.
        onEndReachedThreshold={0.5}
        renderSectionHeader={({ section }) => (
          <View style={{ backgroundColor: c.bg }}>
            {/* A rule between days, so one day reads as one group. Not above
                the first. line-strong: plain line is nearly the ground's own
                colour in the light theme. */}
            {section === sections[0] ? null : (
              <View style={[s.rule, { backgroundColor: c["line-strong"] }]} />
            )}
            <Text style={[s.day, { color: c.muted }]}>{section.title}</Text>
          </View>
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

      {upward ? (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(150)}
          style={s.topWrap}
        >
          <Pressable
            onPress={toTop}
            accessibilityRole="button"
            accessibilityLabel={t("archive.toTop")}
            style={[
              s.top,
              {
                backgroundColor: c.panel,
                borderColor: c.line,
                // The darkest ink of each theme; text is near white on dark.
                shadowColor: dark ? c.bg : c.text,
              },
            ]}
          >
            <View style={s.up}>
              <ChevronIcon color={c.text} />
            </View>
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
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
  // Where it was, by the name every other screen uses -- the desktop's
  // "Urgent·Important" labels were English inside a Korean screen, and a
  // second vocabulary for the same four places. The dot is the quadrant's
  // colour, as on the matrix; the dump has none, as on the move chips.
  const inDump = task.quadrant === INBOX;
  const quad = inDump ? t("inbox.title") : t(`quad.${task.quadrant}.action`);

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
        <View style={s.where}>
          {inDump ? null : (
            <View
              style={[
                s.dot,
                { backgroundColor: c[task.quadrant as keyof typeof c] },
              ]}
            />
          )}
          <Text style={[s.meta, { color: c.faint }]} numberOfLines={1}>
            {quad}
          </Text>
        </View>
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
  // A section label, as "마감일" and "테마" are elsewhere, rather than a
  // faint ruled caption.
  rule: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: SP["4xl"],
    marginTop: SP.md,
  },
  // Fixed over the list's bottom-right corner, clear of the tab bar.
  topWrap: { position: "absolute", right: SP["4xl"], bottom: SP["4xl"] },
  top: {
    width: 44,
    height: 44,
    borderRadius: R.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  // The chevron points right; a quarter turn points it up.
  up: { transform: [{ rotate: "-90deg" }] },
  day: {
    paddingHorizontal: SP["4xl"],
    paddingTop: SP["3xl"],
    paddingBottom: SP.xs,
    fontSize: FS.lg,
    fontWeight: FW.semibold,
  },
  row: { paddingHorizontal: SP["4xl"], paddingVertical: SP.xl },
  rowHead: { flexDirection: "row", gap: SP.md, marginBottom: SP["2xs"] },
  meta: { fontSize: FS.xs, fontVariant: ["tabular-nums"] },
  where: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.xs,
    flexShrink: 1,
  },
  dot: { width: 6, height: 6, borderRadius: R.pill },
  text: { fontSize: FS.lg, lineHeight: FS.lg * LH.snug, fontWeight: FW.light },
  actions: { flexDirection: "row", gap: SP["4xl"], marginTop: SP.md },
  action: { fontSize: FS.sm, fontWeight: FW.semibold },
  emptyBox: { flexGrow: 1, justifyContent: "center" },
  empty: { padding: SP["4xl"], fontSize: FS.md, textAlign: "center" },
});
