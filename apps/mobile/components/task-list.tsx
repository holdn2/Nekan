/**
 * The list, and the drag that lives in it.
 *
 * Dragging is the one thing on this screen that is genuinely harder on a phone
 * than on a desktop, and the layout was chosen to make it easier rather than
 * the other way round: the four cards never scroll and never move, so a drop
 * target is always exactly where the finger last saw it. Nothing here has to
 * scroll the screen while a row is held, which is the part that usually goes
 * wrong.
 *
 * A held row follows the finger but does not leave the list -- no floating
 * clone, no measuring of a portal. What changes is where it *would* land, and
 * that is shown by the thing being landed on: a gap opens between two rows, or
 * a card takes a ring.
 *
 * The gesture waits for a long press before it activates, which is what keeps
 * it from stealing the scroll and from starting on the swipe that reveals
 * Delete. Those three share a finger going down and nothing else.
 */
import { useCallback, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import type { Place, Task } from "@nekan/shared/types";
import { TaskRow } from "./task-row";
import { moveTask, moveToTop } from "../store/mutations";
import { useColors } from "../theme";

/** Where a card is on screen, in window coordinates. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CardRects = Partial<Record<Place, Rect>>;

interface Props {
  tasks: Task[];
  /** Where the four quadrant cards are, measured by the screen that owns them. */
  cards: CardRects;
  onOpen: (task: Task) => void;
}

const hit = (r: Rect | undefined, x: number, y: number) =>
  !!r && x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;

export function TaskList({ tasks, cards, onOpen }: Props) {
  // Row geometry, kept in a ref rather than state: it is read during a gesture
  // and writing it would re-render the list mid-drag.
  const rows = useRef<Record<string, { y: number; height: number }>>({});
  const [heldId, setHeldId] = useState<string | null>(null);
  const [target, setTarget] = useState<{
    card: Place | null;
    before: string | null;
  }>({ card: null, before: null });

  const measure = useCallback((id: string, e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    rows.current[id] = { y, height };
  }, []);

  const begin = useCallback((id: string) => {
    setHeldId(id);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  /** Called on every move: decide what this finger is currently over. */
  const aim = useCallback(
    (id: string, absX: number, absY: number, rowY: number) => {
      for (const place of Object.keys(cards) as Place[]) {
        if (hit(cards[place], absX, absY)) {
          setTarget({ card: place, before: null });
          return;
        }
      }
      // Not over a card: the row whose top half the finger is above. Falling
      // through the loop means the finger is past every row, and `null` says
      // exactly that -- there is no row after it, so it lands last.
      // The gesture reports the finger inside the row it grabbed; the boxes
      // were laid out against the list. Adding the row's own top is what puts
      // the two in the same origin -- comparing them directly aimed at the
      // wrong row by however far down the list the grabbed one sat.
      const self = rows.current[id];
      const pointerY = (self ? self.y : 0) + rowY;
      let before: string | null = null;
      for (const task of tasks) {
        if (task.id === id) continue;
        const box = rows.current[task.id];
        if (box && pointerY < box.y + box.height / 2) {
          before = task.id;
          break;
        }
      }
      setTarget({ card: null, before });
    },
    [cards, tasks],
  );

  const drop = useCallback(
    (id: string, quadrant: Place | null) => {
      setHeldId(null);
      const aimed = target;
      setTarget({ card: null, before: null });
      if (aimed.card) {
        // The open quadrant is drawn as unavailable, so a drop on it is a
        // no-op rather than a move that changes nothing but writes anyway.
        if (aimed.card !== quadrant) moveToTop(id, aimed.card);
        return;
      }
      // No card under the finger: a reorder inside this list. `before` may be
      // null, and here that means last rather than nowhere.
      if (quadrant) moveTask(id, quadrant, aimed.before);
    },
    [target],
  );

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.inner}
      scrollEnabled={heldId === null}
      // Scrolling the list puts the keyboard away; tapping a row does what the
      // row does. Without "handled" the first tap is spent dismissing, so
      // opening a task while typing would take two.
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
    >
      {tasks.map((task, i) => (
        <DraggableRow
          key={task.id}
          task={task}
          first={i === 0}
          markAbove={
            heldId !== null && target.card === null && target.before === task.id
          }
          markBelow={
            heldId !== null &&
            target.card === null &&
            target.before === null &&
            i === tasks.length - 1
          }
          onLayout={(e) => measure(task.id, e)}
          onBegin={() => begin(task.id)}
          onAim={(x, y, ly) => aim(task.id, x, y, ly)}
          onDrop={() => drop(task.id, task.quadrant)}
          onPress={() => onOpen(task)}
        />
      ))}
    </ScrollView>
  );
}

interface RowProps {
  task: Task;
  first: boolean;
  markAbove: boolean;
  markBelow: boolean;
  onLayout: (e: LayoutChangeEvent) => void;
  onBegin: () => void;
  /** Third argument is the finger inside this row, not inside the list. */
  onAim: (absX: number, absY: number, rowY: number) => void;
  onDrop: () => void;
  onPress: () => void;
}

function DraggableRow({
  task,
  first,
  markAbove,
  markBelow,
  onLayout,
  onBegin,
  onAim,
  onDrop,
  onPress,
}: RowProps) {
  const c = useColors();
  const dy = useSharedValue(0);
  // A press that turned into a drag must not also count as a tap. The row's
  // Pressable is a child of this detector and finishes its own press on
  // release, so it has to be told the gesture took over -- otherwise letting
  // go of a dragged row opens it.
  const dragged = useRef(false);

  const began = () => {
    dragged.current = true;
    onBegin();
  };

  const press = () => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    onPress();
  };

  const pan = Gesture.Pan()
    // The long press is the whole reason the three gestures can coexist.
    .activateAfterLongPress(220)
    .onStart(() => {
      runOnJS(began)();
    })
    .onUpdate((e) => {
      dy.value = e.translationY;
      runOnJS(onAim)(e.absoluteX, e.absoluteY, e.y + e.translationY);
    })
    .onEnd(() => {
      dy.value = 0;
      runOnJS(onDrop)();
    })
    .onFinalize(() => {
      dy.value = 0;
    });

  // Both transforms belong to the same style object. Splitting the lift into
  // a static one would silently win -- a later entry in a style array replaces
  // `transform` outright rather than merging into it, so the row would stop
  // following the finger and only grow.
  const style = useAnimatedStyle(() => {
    const lifted = dy.value !== 0;
    return {
      transform: [{ translateY: dy.value }, { scale: lifted ? 1.02 : 1 }],
      opacity: lifted ? 0.92 : 1,
      zIndex: lifted ? 1 : 0,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View onLayout={onLayout} style={style}>
        {markAbove ? (
          <View style={[s.mark, { backgroundColor: c.text }]} />
        ) : null}
        <TaskRow task={task} first={first} onPress={press} />
        {markBelow ? (
          <View style={[s.mark, { backgroundColor: c.text }]} />
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1 },
  inner: { paddingBottom: 4 },
  // A rule where the row will land. A hole in the list was tried first and
  // read as a glitch: it moves everything below it, so the list appears to
  // jump rather than to be pointed at.
  mark: { height: 2, marginHorizontal: 15, borderRadius: 999 },
});
