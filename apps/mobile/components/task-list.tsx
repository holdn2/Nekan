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
import {
  runOnJS,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import type { Place, Task } from "@nekan/shared/types";
import { TaskRow } from "./task-row";
import { moveTask, moveToTop } from "../store/mutations";
import { R, SP, useColors } from "../theme";

/** Where a card is on screen, in window coordinates. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CardRects = Partial<Record<Place, Rect>>;

/**
 * How the carried row gets drawn somewhere this list cannot reach.
 *
 * The panel clips its contents -- it has to, or the list spills past its
 * rounded corner -- so a row dragged towards the quadrant grid disappeared at
 * the panel's edge, exactly when knowing where it is matters most. The answer
 * is to leave the row where it is, dimmed, and let the screen draw a copy that
 * follows the finger above everything.
 *
 * Positions are shared values, not state: they are written on every frame from
 * inside the gesture, and a render per frame is what this list already goes out
 * of its way to avoid.
 */
export interface DragBus {
  x: SharedValue<number>;
  y: SharedValue<number>;
  width: SharedValue<number>;
  /** Which row is being carried. State, and set twice in a drag -- not a frame. */
  show: (row: { task: Task; index: number } | null) => void;
}

interface Props {
  tasks: Task[];
  /** Where the four quadrant cards are, measured by the screen that owns them. */
  cards: CardRects;
  drag: DragBus;
  onOpen: (task: Task) => void;
}

const hit = (r: Rect | undefined, x: number, y: number) =>
  !!r && x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;

export function TaskList({ tasks, cards, drag, onOpen }: Props) {
  // Row geometry, kept in a ref rather than state: it is read during a gesture
  // and writing it would re-render the list mid-drag.
  const rows = useRef<
    Record<string, { y: number; height: number; width: number }>
  >({});
  const [heldId, setHeldId] = useState<string | null>(null);
  const [target, setTarget] = useState<{
    card: Place | null;
    before: string | null;
  }>({ card: null, before: null });

  const measure = useCallback((id: string, e: LayoutChangeEvent) => {
    const { y, height, width } = e.nativeEvent.layout;
    rows.current[id] = { y, height, width };
  }, []);

  const begin = useCallback(
    (task: Task, index: number) => {
      setHeldId(task.id);
      // The copy is the row's width; the gesture already put it under the
      // finger, keeping the grip it was picked up by.
      drag.width.value = rows.current[task.id]?.width ?? 0;
      drag.show({ task, index });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [drag],
  );

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
    (id: string, quadrant: Place | null, moved: boolean) => {
      setHeldId(null);
      drag.show(null);
      const aimed = target;
      setTarget({ card: null, before: null });
      // A cancelled gesture runs onEnd too, and `moved` is how the handler
      // says which one this was. Writing on a cancel would save a move the
      // finger never finished -- the row snaps back and the file disagrees.
      if (!moved) return;
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
    [target, drag],
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
          index={i}
          markAbove={
            heldId !== null && target.card === null && target.before === task.id
          }
          markBelow={
            heldId !== null &&
            target.card === null &&
            target.before === null &&
            i === tasks.length - 1
          }
          held={heldId === task.id}
          drag={drag}
          onLayout={(e) => measure(task.id, e)}
          onBegin={() => begin(task, i)}
          onAim={(x, y, ly) => aim(task.id, x, y, ly)}
          onDrop={(moved) => drop(task.id, task.quadrant, moved)}
          onPress={() => onOpen(task)}
        />
      ))}
    </ScrollView>
  );
}

interface RowProps {
  task: Task;
  index: number;
  /** Carried right now: it stays put and fades, the copy does the moving. */
  held: boolean;
  drag: DragBus;
  markAbove: boolean;
  markBelow: boolean;
  onLayout: (e: LayoutChangeEvent) => void;
  onBegin: () => void;
  /** Third argument is the finger inside this row, not inside the list. */
  onAim: (absX: number, absY: number, rowY: number) => void;
  /** True when the drag ended; false when it was cancelled. */
  onDrop: (moved: boolean) => void;
  onPress: () => void;
}

function DraggableRow({
  task,
  index,
  held,
  drag,
  markAbove,
  markBelow,
  onLayout,
  onBegin,
  onAim,
  onDrop,
  onPress,
}: RowProps) {
  const c = useColors();
  // Where inside the row the finger landed, so the copy keeps that grip
  // instead of jumping its own top-left corner under the finger.
  const grabX = useSharedValue(0);
  const grabY = useSharedValue(0);
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
    .onStart((e) => {
      grabX.value = e.x;
      grabY.value = e.y;
      drag.x.value = e.absoluteX - e.x;
      drag.y.value = e.absoluteY - e.y;
      runOnJS(began)();
    })
    .onUpdate((e) => {
      drag.x.value = e.absoluteX - grabX.value;
      drag.y.value = e.absoluteY - grabY.value;
      // The row no longer moves, so the finger's offset inside it is already
      // in the row's own frame -- there is no translation left to add back.
      runOnJS(onAim)(e.absoluteX, e.absoluteY, e.y);
    })
    .onEnd((_e, success) => {
      runOnJS(onDrop)(success);
    });

  return (
    <GestureDetector gesture={pan}>
      {/* The row stays where it is and fades; the copy above the screen does
          the travelling. The desktop leaves the dragged row in place at 0.4
          for the same reason -- the gap it would leave behind is a worse
          answer than a dimmed row, because the list stops moving under the
          thing being aimed. */}
      <View onLayout={onLayout} style={held ? s.held : undefined}>
        {markAbove ? (
          <View style={[s.mark, { backgroundColor: c.text }]} />
        ) : null}
        <TaskRow task={task} index={index} onPress={press} />
        {markBelow ? (
          <View style={[s.mark, { backgroundColor: c.text }]} />
        ) : null}
      </View>
    </GestureDetector>
  );
}

const s = StyleSheet.create({
  held: { opacity: 0.4 },
  scroll: { flex: 1 },
  inner: { paddingBottom: 4 },
  // A rule where the row will land. A hole in the list was tried first and
  // read as a glitch: it moves everything below it, so the list appears to
  // jump rather than to be pointed at.
  mark: { height: 2, marginHorizontal: SP["4xl"], borderRadius: R.pill },
});
