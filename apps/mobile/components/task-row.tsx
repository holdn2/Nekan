/**
 * One row, in either list.
 *
 * The two lists are not the same row. A quadrant row can be completed, carries
 * a note and a due date, and opens a detail sheet; a brain-dump row has none of
 * those and opens straight into editing its text. That is the desktop's rule,
 * and it is not cosmetic: a dump row's `space` is null, so completing one
 * would file it into history on *both* boards at once.
 *
 * Three gestures, chosen so none of them shares a beginning with another:
 *
 *   tap          detail, or -- in the dump -- edit the text
 *   long press   pick the row up (the drag lives in the list above)
 *   swipe left   reveal Delete; the button deletes, not the swipe
 *
 * The swipe reveals rather than deletes because a finger brushing past a list
 * should not be able to remove anything, and because "undo" on a phone is a
 * thing you have to remember exists.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Gesture,
  GestureDetector,
  Pressable,
} from "react-native-gesture-handler";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { INBOX, dueInfo, formatDue } from "@nekan/shared/core";
import type { Task } from "@nekan/shared/types";
import { CheckCircleIcon, MemoIcon } from "../icons";
import { locale, t } from "../i18n";
import { FS, FW, LH, R, SP, useColors, type Colors } from "../theme";
import { completeTask, deleteTask } from "../store/mutations";

interface Props {
  task: Task;
  /** Zero-based; the row shows it one-based, the way the desktop does. */
  index: number;
  onPress: () => void;
}

/** The action the swipe uncovers. Its width is fixed so the row can slide. */
function DeleteAction({
  drag,
  colors,
  onPress,
}: {
  drag: SharedValue<number>;
  colors: Colors;
  onPress: () => void;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value + ACTION_WIDTH }],
  }));
  return (
    <Animated.View style={[s.action, style]}>
      <Pressable
        onPress={onPress}
        style={[s.actionButton, { backgroundColor: colors.danger }]}
        accessibilityRole="button"
        accessibilityLabel={t("common.delete")}
      >
        <Text style={[s.actionLabel, { color: colors["on-accent"] }]}>
          {t("common.delete")}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const ACTION_WIDTH = 88;

/**
 * How long a finger has to stay on a row before the row lights up.
 *
 * Lit on touch-down, every finger that lands on a row to scroll the list
 * flashed it -- the list moves a few points later, not at contact. iOS's own
 * lists wait the same way before highlighting a cell.
 */
const PRESS_DELAY_MS = 120;

type ScrollListener = () => void;

/** A one-way signal from the list to its rows: "a scroll just started". */
export function makeScrollSignal() {
  const listeners = new Set<ScrollListener>();
  return {
    on(fn: ScrollListener) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    fire() {
      for (const fn of listeners) fn();
    },
  };
}

/**
 * Provided by TaskList. A context holding a stable object rather than a
 * counter, on purpose: a counter would re-render every row on every scroll,
 * and a re-render rebuilds each row's drag gesture mid-scroll -- a
 * re-attachment worth not adding while touches are in flight.
 */
export const ScrollSignal = createContext<ReturnType<
  typeof makeScrollSignal
> | null>(null);

export function TaskRow({ task, index, onPress }: Props) {
  const c = useColors();
  const inDump = task.quadrant === INBOX;
  const info = dueInfo(task.dueDate, new Date());
  const due = formatDue(info, t, locale());
  const [pressed, setPressed] = useState(false);

  // The pressed look is switched on late and switched off by any of four
  // things, because one was not enough. It used to be on at touch-down and off
  // only in `onFinalize`, and a device showed two rows lit at once while
  // nothing touched the screen -- one finger cannot press two rows, so both
  // had missed their end. The library dispatches FAILED and CANCELLED to
  // `onFinalize` correctly, so the event itself did not arrive for these rows.
  // Which native path loses it was not pinned down -- that takes a device and
  // a way to watch the handler states. Rather than trust that one signal, the
  // look now also ends when the finger lifts, when
  // the touch is cancelled, and when the list starts scrolling -- no row can
  // truthfully look pressed while its list is moving.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { hold, release } = useMemo(() => {
    const release = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      setPressed(false);
    };
    const hold = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        setPressed(true);
      }, PRESS_DELAY_MS);
    };
    return { hold, release };
  }, []);
  const scrolls = useContext(ScrollSignal);
  useEffect(() => scrolls?.on(release), [scrolls, release]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // The row and its completion circle answer taps with gestures this file
  // owns, not with Pressable, and that is the fix for a row that would not
  // open.
  //
  // ReanimatedSwipeable wraps its children in a Tap of its own -- it closes an
  // open row -- and that Tap activates on every tap. An activating gesture
  // cancels every gesture it is not declared simultaneous with, and the one it
  // cancelled was the Pressable's native button: Pressable only calls onPress
  // after that button starts, so the press was dropped without a word. The
  // Delete button kept working because the swipeable renders it outside that
  // Tap. The swipeable's Tap cannot be named from here, but the swipeable can
  // be told which outside gestures run alongside it, and a Pressable's inner
  // gestures cannot be named either -- hence gestures of our own.
  //
  // They must be stable. A gesture rebuilt mid-press is re-attached, and the
  // press it was tracking ends as a cancel: `pressed` changes on touch-down, so
  // anything that rebuilt on render would never finish a tap. The callback is
  // read through a ref for that reason.
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;
  const complete = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .onEnd((_e, success) => {
          if (success) completeTask(task.id);
        }),
    [task.id],
  );
  const open = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .maxDistance(10)
        // The circle sits inside the row. Without this a tap on it would
        // complete the task and open it in the same motion.
        .requireExternalGestureToFail(complete)
        .onBegin(hold)
        .onFinalize(release)
        .onTouchesUp(release)
        .onTouchesCancelled(release)
        .onEnd((_e, success) => {
          if (success) onPressRef.current();
        }),
    [complete, hold, release],
  );
  const alongside = useMemo(() => [open, complete], [open, complete]);

  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={ACTION_WIDTH / 2}
      simultaneousWithExternalGesture={alongside}
      renderRightActions={(_progress, drag) => (
        <DeleteAction
          drag={drag}
          colors={c}
          onPress={() => deleteTask(task.id)}
        />
      )}
    >
      <GestureDetector gesture={open}>
        <View
          // Pressed rather than a rule between rows. The desktop draws no
          // separator either -- a row is a block that lights up when the pointer
          // is over it, and the phone's equivalent of that is the touch.
          style={[s.row, { backgroundColor: pressed ? c["panel-2"] : c.panel }]}
          // Gestures are invisible to VoiceOver, so what a tap does is also
          // offered as actions: the double-tap opens, and completing is a
          // named action rather than a child the grouped row would hide.
          accessible
          accessibilityRole="button"
          accessibilityLabel={task.text}
          accessibilityActions={
            inDump
              ? [{ name: "activate" }]
              : [
                  { name: "activate" },
                  { name: "complete", label: t("item.complete") },
                ]
          }
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === "activate") onPressRef.current();
            if (e.nativeEvent.actionName === "complete") completeTask(task.id);
          }}
        >
          <Text style={[s.num, { color: c.faint }]}>{index + 1}.</Text>

          {inDump ? null : (
            <GestureDetector gesture={complete}>
              {/* The icon is small, so the reach is widened -- on the View, not
                the gesture. A gesture's positive hitSlop does nothing on iOS:
                a recognizer only sees touches that UIKit's hit test already
                routed to its view, and only a view can widen that test
                (RNGestureHandler.mm says so beside shouldReceiveTouch). */}
              <View hitSlop={8}>
                <CheckCircleIcon color={c.muted} tickColor={c["on-accent"]} />
              </View>
            </GestureDetector>
          )}

          <Text style={[s.text, { color: c.text }]} numberOfLines={2}>
            {task.text}
          </Text>

          {task.memo && !inDump ? <MemoIcon color={c.faint} /> : null}
          {due && !inDump ? (
            <Text
              style={[
                s.due,
                {
                  color: info?.state === "overdue" ? c.danger : c.muted,
                  borderColor: c.line,
                },
              ]}
            >
              {due.text}
            </Text>
          ) : null}
        </View>
      </GestureDetector>
    </ReanimatedSwipeable>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.xl,
    paddingHorizontal: SP["4xl"],
    paddingVertical: SP.xl,
  },
  // The digits form a column, so they are right-aligned and tabular.
  num: {
    minWidth: 15,
    textAlign: "right",
    fontSize: FS.xs,
    lineHeight: FS.xs * LH.relaxed,
    fontVariant: ["tabular-nums"],
  },
  // The desktop sets `leading-snug` on this text and nothing else does;
  // RN has no ratio, so it is multiplied out here.
  text: {
    flex: 1,
    fontSize: FS.lg,
    lineHeight: FS.lg * LH.snug,
    fontWeight: FW.light,
  },
  due: {
    fontSize: FS.xs,
    paddingHorizontal: SP.md,
    paddingVertical: SP["2xs"],
    borderRadius: R.pill,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  action: { width: ACTION_WIDTH },
  actionButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { fontSize: FS.md, fontWeight: FW.semibold },
});
