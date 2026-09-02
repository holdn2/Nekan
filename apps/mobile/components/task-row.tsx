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
import { StyleSheet, Text } from "react-native";
import { Pressable } from "react-native-gesture-handler";
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
  onLongPress?: () => void;
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

export function TaskRow({ task, index, onPress, onLongPress }: Props) {
  const c = useColors();
  const inDump = task.quadrant === INBOX;
  const info = dueInfo(task.dueDate, new Date());
  const due = formatDue(info, t, locale());

  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={ACTION_WIDTH / 2}
      renderRightActions={(_progress, drag) => (
        <DeleteAction
          drag={drag}
          colors={c}
          onPress={() => deleteTask(task.id)}
        />
      )}
    >
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={220}
        // Pressed rather than a rule between rows. The desktop draws no
        // separator either -- a row is a block that lights up when the pointer
        // is over it, and the phone's equivalent of that is the touch.
        style={({ pressed }) => [
          s.row,
          { backgroundColor: pressed ? c["panel-2"] : c.panel },
        ]}
      >
        <Text style={[s.num, { color: c.faint }]}>{index + 1}.</Text>

        {inDump ? null : (
          <Pressable
            onPress={() => completeTask(task.id)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t("item.complete")}
          >
            <CheckCircleIcon color={c.muted} tickColor={c["on-accent"]} />
          </Pressable>
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
      </Pressable>
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
