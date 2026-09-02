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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { INBOX, SPACES, isCrowded } from "@nekan/shared/core";
import type { Place, Quadrant, Space, Task } from "@nekan/shared/types";
import { AddForm } from "../../components/add-form";
import { TaskList, type CardRects } from "../../components/task-list";
import { TaskRow } from "../../components/task-row";
import { CloseIcon } from "../../icons";
import { t } from "../../i18n";
import { FS, FW, R, SP, useColors } from "../../theme";
import { router } from "expo-router";
import { activeOf, counts, inboxTasks, quadrants } from "../../store/selectors";
import { currentSpace, isReady, setSpace } from "../../store/state";
import { useStore } from "../../store/use-store";

// LayoutAnimation does nothing under the New Architecture -- not degraded,
// absent -- which is why opening a quadrant snapped. Reanimated's do work on
// Fabric and respect reduce-motion on their own.
//
// A plain fade was tried first and could not be seen: the panel is flex:1, so
// nothing about it moves, and 150ms of opacity on a full panel reads as a
// flicker. The direction is what makes it legible, and it is also true -- a
// quadrant's list comes up from the grid it was tapped on, and the dump comes
// back down from where it was.
const OPENING = FadeInDown.duration(220);
const CLOSING = FadeInUp.duration(220);

export default function MatrixScreen() {
  const c = useColors();
  useStore();
  const [open, setOpen] = useState<Quadrant | null>(null);
  // Where the four cards are in window coordinates, so a dragged row can be
  // asked which one it is over. Measured on layout and kept in a ref: it is
  // read during a gesture, and setting state there would redraw mid-drag.
  const cards = useRef<CardRects>({});
  // The carried row is drawn here rather than in the list, because the panel
  // clips and this does not. Position and width are shared values written on
  // every frame; which row it is, is state written twice a drag.
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const dragWidth = useSharedValue(0);
  const [carried, setCarried] = useState<{ task: Task; index: number } | null>(
    null,
  );
  const drag = useMemo(
    () => ({ x: dragX, y: dragY, width: dragWidth, show: setCarried }),
    [dragX, dragY, dragWidth],
  );
  const ghost = useAnimatedStyle(() => ({
    transform: [{ translateX: dragX.value }, { translateY: dragY.value }],
    width: dragWidth.value,
  }));
  const space = currentSpace();
  const n = counts();
  const rows = open ? activeOf(open) : inboxTasks();

  const toggle = (q: Quadrant) => {
    // A card is one of the "somewhere else" the keyboard should go away for.
    // The wrapper below cannot do it: a tap that lands on a child Pressable
    // never reaches the parent.
    Keyboard.dismiss();
    setOpen((prev) => (prev === q ? null : q));
  };

  const measureCard = useCallback(
    (place: Place) => (e: LayoutChangeEvent) => {
      e.target.measureInWindow((x, y, width, height) => {
        cards.current[place] = { x, y, width, height };
      });
    },
    [],
  );

  // The strip below only exists while a quadrant is open, and a rectangle left
  // behind would go on claiming that part of the screen.
  useEffect(() => {
    if (!open) delete cards.current[INBOX];
  }, [open]);

  return (
    <View style={[s.window, { backgroundColor: c.bg }]}>
      <SafeAreaView style={s.root} edges={["top"]}>
        {/* Anything that is not the field puts the keyboard away. This catches
          the bare parts -- the bar, the gaps, the panel's own background --
          and the controls that sit on top of it say so themselves, because a
          tap consumed by a child never reaches here. */}
        <Pressable
          style={s.dismiss}
          onPress={() => Keyboard.dismiss()}
          accessible={false}
        >
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

          {/* Filing was one-way without this. A task typed into the dump goes down
          into a quadrant and could never come back: the four cards were the
          only things a drag could aim at, and the detail screen offered only
          the other three quadrants.

          It sits outside the panel rather than above the list inside it, and
          both halves of that matter. It reads as the dump collapsed -- which is
          what the desktop shows in the same place -- and it is far enough from
          the first row that dragging one to the top does not get caught by it
          on the way. */}
          {open ? (
            <Pressable
              onLayout={measureCard(INBOX)}
              // Tapping it is closing the quadrant: the box *is* the dump, and
              // what is behind a collapsed thing is the thing opened.
              onPress={() => {
                Keyboard.dismiss();
                setOpen(null);
              }}
              accessibilityRole="button"
              accessibilityLabel={t("inbox.title")}
              style={[
                s.unfile,
                { backgroundColor: c.panel, borderColor: c.line },
              ]}
            >
              <Text style={[s.unfileTitle, { color: c.text }]}>
                {t("inbox.title")}
              </Text>
              <Text
                style={[s.unfileHint, { color: c.faint }]}
                numberOfLines={1}
              >
                {t("matrix.unfile")}
              </Text>
              <Text style={[s.unfileCount, { color: c.faint }]}>
                {inboxTasks().length}
              </Text>
            </Pressable>
          ) : null}

          <View
            style={[
              s.panel,
              open && s.panelUnderBox,
              { backgroundColor: c.panel, borderColor: c.line },
            ]}
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

            {/* Keyed by which list it is, so swapping one for the other is a
              new element fading in rather than the same one changing its
              contents -- which is what makes the change readable. */}
            <Animated.View
              key={open ?? "dump"}
              entering={open ? OPENING : CLOSING}
              style={s.panelBody}
            >
              {rows.length === 0 ? (
                // Takes the whole panel, so the form below stays at the bottom
                // rather than riding up under a one-line sentence. Nothing is
                // drawn until the file has been read: an empty-state sentence
                // over a board that has simply not loaded yet would be a lie for
                // the frame it is up.
                <View style={s.emptyBox}>
                  <Text style={[s.empty, { color: c.faint }]}>
                    {!isReady()
                      ? ""
                      : open
                        ? t("matrix.empty")
                        : t("inbox.empty")}
                  </Text>
                </View>
              ) : (
                <TaskList
                  tasks={rows}
                  cards={cards.current}
                  drag={drag}
                  onOpen={(task: Task) => router.push(`/task/${task.id}`)}
                />
              )}
            </Animated.View>

            {/* The form follows whichever list is open, so a quadrant can be
              written into directly -- the desktop gives every quadrant its own
              field for the same reason. What is typed into the dump still
              belongs to neither board until it is filed. */}
            <AddForm place={open ?? INBOX} />
          </View>

          <View style={s.grid}>
            {quadrants().map((q) => {
              const selected = q === open;
              return (
                <Pressable
                  key={q}
                  onLayout={measureCard(q)}
                  onPress={() => toggle(q)}
                  style={[
                    s.card,
                    { backgroundColor: c.panel, borderColor: c.line },
                    // The open quadrant is drawn as somewhere you cannot drop,
                    // because its rows are already the list above.
                    // Dash length follows border width in RN, so a hairline
                    // gives a dash too short to read as one. Two pixels is what
                    // makes it dashes; the lower opacity is what says "not
                    // this one".
                    selected && {
                      borderColor: c.danger,
                      borderStyle: "dashed",
                      borderWidth: 2,
                      opacity: 0.28,
                    },
                  ]}
                >
                  <View style={[s.wash, { backgroundColor: c[q] }]} />
                  <Text
                    style={[s.cardTitle, { color: c.text }]}
                    numberOfLines={2}
                  >
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
        </Pressable>
      </SafeAreaView>

      {/* Outside the safe area on purpose: the gesture reports window
          coordinates, and a container that starts below the notch would put
          the copy that far off. Nothing here takes touches -- the finger is
          still talking to the row underneath. */}
      {carried ? (
        <Animated.View pointerEvents="none" style={[s.ghost, ghost]}>
          <View
            style={[
              s.ghostCard,
              {
                backgroundColor: c.panel,
                borderColor: c.line,
                shadowColor: c.text,
              },
            ]}
          >
            <TaskRow task={carried.task} index={carried.index} onPress={NOOP} />
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** The copy is not interactive; TaskRow asks for a handler all the same. */
const NOOP = () => {};

const s = StyleSheet.create({
  window: { flex: 1 },
  root: { flex: 1 },
  ghost: { position: "absolute", top: 0, left: 0 },
  // Lifted off the page: a border and a shadow, and the row's own background
  // so the list does not read through it.
  ghostCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: R.md,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  dismiss: { flex: 1 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SP["4xl"],
    paddingVertical: SP.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  brand: { fontSize: FS.xl, fontWeight: FW.semibold },
  switch_: {
    flexDirection: "row",
    borderRadius: R.pill,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  switchItem: {
    paddingHorizontal: SP["3xl"],
    paddingVertical: SP.sm,
    fontSize: FS.md,
    fontWeight: FW.semibold,
    borderRadius: R.pill,
    overflow: "hidden",
  },
  // Shrinks so the grid keeps its size; the grid is what you drop onto.
  panelBody: { flex: 1, minHeight: 0 },
  panel: {
    flex: 1,
    minHeight: 0,
    margin: SP["4xl"],
    marginBottom: SP.md,

    borderRadius: R.lg,
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
  // The box brings its own top margin, so the panel gives up most of its own.
  // Two full margins read as a gap with nothing in it.
  panelUnderBox: { marginTop: SP.md },
  // Shaped like the panel below it, because it is the same thing collapsed.
  unfile: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.md,
    marginHorizontal: SP["4xl"],
    marginTop: SP["4xl"],
    paddingHorizontal: SP.xl,
    paddingVertical: SP.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: R.lg,
  },
  unfileTitle: { fontSize: FS.md, fontWeight: FW.semibold },
  // Takes the slack, so the count stays pinned to the right edge.
  unfileHint: { flex: 1, fontSize: FS.xs },
  unfileCount: { fontSize: FS.md, fontVariant: ["tabular-nums"] },
  panelTitle: { fontSize: FS.lg, fontWeight: FW.semibold, flexShrink: 1 },
  shared: { fontSize: FS.xs },
  emptyBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SP["4xl"],
  },
  empty: { fontSize: FS.xs, textAlign: "center" },
  list: { flex: 1 },
  listInner: { paddingBottom: SP.xl },
  row: {
    paddingHorizontal: SP["4xl"],
    paddingVertical: SP.xl,
    fontSize: FS.lg,
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
    borderRadius: R.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SP.xl,
    overflow: "hidden",
    justifyContent: "space-between",
  },
  // A band rather than a fill: at this size a whole card of quadrant colour
  // would out-shout the counts, and the counts are the content.
  wash: { position: "absolute", left: 0, right: 0, top: 0, height: 4 },
  cardTitle: { fontSize: FS.md, fontWeight: FW.semibold, marginTop: SP.xs },
  count: { fontSize: FS["3xl"], fontWeight: FW.semibold },
});
