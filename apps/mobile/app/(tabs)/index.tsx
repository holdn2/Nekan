/**
 * The matrix screen.
 *
 * Two states in one screen, which is what makes a phone-sized Eisenhower
 * matrix work at all: normally the brain dump is open and the four quadrants
 * are counts, and tapping a quadrant swaps its list into the dump's place.
 * Only one list is ever on screen, so its rows can be full width.
 *
 * The grid does not scroll and does not move. That is why there will be no
 * autoscroll while dragging: every drop target is always where it was.
 *
 * Rows are read-only here. The circle, the swipe and the drag arrive with the
 * writes -- a control that is drawn but does nothing is worse than one that is
 * not drawn yet.
 */
import { useState } from "react";
import {
  LayoutAnimation,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SPACES, isCrowded } from "@nekan/shared/core";
import type { Quadrant, Space, Task } from "@nekan/shared/types";
import { CloseIcon } from "../../icons";
import { t } from "../../i18n";
import { SP, useColors } from "../../theme";
import { activeOf, counts, inboxTasks, quadrants } from "../../store/selectors";
import { currentSpace, isReady, setSpace } from "../../store/state";
import { useStore } from "../../store/use-store";

/** Opening and closing is a layout change, so the layout animates itself. */
const ease = () =>
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

export default function MatrixScreen() {
  const c = useColors();
  useStore();
  const [open, setOpen] = useState<Quadrant | null>(null);
  const space = currentSpace();
  const n = counts();
  const rows = open ? activeOf(open) : inboxTasks();

  const toggle = (q: Quadrant) => {
    ease();
    setOpen((prev) => (prev === q ? null : q));
  };

  return (
    <SafeAreaView style={[s.root, { backgroundColor: c.bg }]} edges={["top"]}>
      <View style={[s.bar, { borderBottomColor: c.line }]}>
        <Text style={[s.brand, { color: c.text }]}>Nekan</Text>
        <View
          style={[
            s.switch_,
            { backgroundColor: c["panel-2"], borderColor: c.line },
          ]}
        >
          {SPACES.map((sp: Space) => (
            <Pressable key={sp} onPress={() => setSpace(sp)} hitSlop={4}>
              <Text
                style={[
                  s.switchItem,
                  sp === space
                    ? { backgroundColor: c.accent, color: c["on-accent"] }
                    : { color: c.muted },
                ]}
              >
                {t(`space.${sp}`)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View
        style={[s.panel, { backgroundColor: c.panel, borderColor: c.line }]}
      >
        <View style={s.panelHead}>
          <Text style={[s.panelTitle, { color: c.text }]} numberOfLines={1}>
            {open ? t(`quad.${open}.action`) : t("inbox.title")}
          </Text>
          {open ? (
            <Pressable
              onPress={() => toggle(open)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
            >
              <CloseIcon color={c.muted} />
            </Pressable>
          ) : (
            <Text style={[s.shared, { color: c.faint }]}>
              {t("inbox.shared")}
            </Text>
          )}
        </View>

        {rows.length === 0 ? (
          // Nothing at all until the file has been read: an empty-state
          // sentence shown over a board that has simply not loaded yet would
          // be a lie for the frame it is on screen.
          <Text style={[s.empty, { color: c.faint }]}>
            {!isReady() ? "" : open ? t("matrix.empty") : t("inbox.empty")}
          </Text>
        ) : (
          <ScrollView style={s.list} contentContainerStyle={s.listInner}>
            {rows.map((task: Task, i: number) => (
              <Text
                key={task.id}
                style={[
                  s.row,
                  { color: c.text, borderTopColor: c.line },
                  i === 0 && s.firstRow,
                ]}
                numberOfLines={2}
              >
                {task.text}
              </Text>
            ))}
          </ScrollView>
        )}
      </View>

      <View style={s.grid}>
        {quadrants().map((q) => {
          const selected = q === open;
          return (
            <Pressable
              key={q}
              onPress={() => toggle(q)}
              style={[
                s.card,
                { backgroundColor: c.panel, borderColor: c.line },
                // The open quadrant is drawn as somewhere you cannot drop,
                // because its rows are already the list above.
                selected && {
                  borderColor: c.danger,
                  borderStyle: "dashed",
                  opacity: 0.45,
                },
              ]}
            >
              <View style={[s.wash, { backgroundColor: c[q] }]} />
              <Text style={[s.cardTitle, { color: c.text }]} numberOfLines={2}>
                {t(`quad.${q}.action`)}
              </Text>
              <Text
                style={[
                  s.count,
                  { color: isCrowded(q, n[q]) ? c.danger : c.muted },
                ]}
              >
                {n[q]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SP["4xl"],
    paddingVertical: SP.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  brand: { fontSize: 17, fontWeight: "700" },
  switch_: {
    flexDirection: "row",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  switchItem: {
    paddingHorizontal: SP["3xl"],
    paddingVertical: SP.sm,
    fontSize: 13,
    fontWeight: "600",
    borderRadius: 999,
    overflow: "hidden",
  },
  // Shrinks so the grid keeps its size; the grid is what you drop onto.
  panel: {
    flex: 1,
    minHeight: 0,
    margin: SP["4xl"],
    marginBottom: SP.md,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  panelHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SP.xl,
    paddingHorizontal: SP["4xl"],
    paddingTop: SP["4xl"],
    paddingBottom: SP.xl,
  },
  panelTitle: { fontSize: 15, fontWeight: "700", flexShrink: 1 },
  shared: { fontSize: 11 },
  empty: {
    paddingHorizontal: SP["4xl"],
    paddingBottom: SP["4xl"],
    fontSize: 13,
  },
  list: { flex: 1 },
  listInner: { paddingBottom: SP.xl },
  row: {
    paddingHorizontal: SP["4xl"],
    paddingVertical: SP.xl,
    fontSize: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  firstRow: { borderTopWidth: 0 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: SP["4xl"],
    paddingBottom: SP["4xl"],
    gap: SP.xl,
  },
  card: {
    flexBasis: "47%",
    flexGrow: 1,
    height: 96,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SP.xl,
    overflow: "hidden",
    justifyContent: "space-between",
  },
  // A band rather than a fill: at this size a whole card of quadrant colour
  // would out-shout the counts, and the counts are the content.
  wash: { position: "absolute", left: 0, right: 0, top: 0, height: 4 },
  cardTitle: { fontSize: 13, fontWeight: "600", marginTop: SP.xs },
  count: { fontSize: 20, fontWeight: "700" },
});
