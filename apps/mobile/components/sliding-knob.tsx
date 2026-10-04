/**
 * One pill that slides to the chosen option, for the controls that pick one of
 * a few: the header's 업무/일상 switch and the settings choices.
 *
 * The desktop's switch does the same (styles/switch.css: 180ms on
 * cubic-bezier(0.4, 0, 0.2, 1)), but by a CSS rule that only holds for exactly
 * two equal halves. Here each option is measured, so three options and options
 * of different widths ("시스템 설정" beside "다크") slide just as well.
 *
 * The first position is set without animating -- a control that slid into
 * place every time a screen opened would look like it was changing.
 * With the system's reduce-motion setting on, it moves without sliding.
 */
import { useEffect, useRef, useState } from "react";
import type { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const SLIDE = { duration: 180, easing: Easing.bezier(0.4, 0, 0.2, 1) };

type Spot = { x: number; width: number };

export function useSlidingKnob(selected: number) {
  const spots = useRef<Spot[]>([]);
  const [measured, setMeasured] = useState(0);
  const x = useSharedValue(0);
  const width = useSharedValue(0);
  const placed = useRef(false);
  const still = useReducedMotion();

  const onOptionLayout = (index: number) => (e: LayoutChangeEvent) => {
    const { x: left, width: w } = e.nativeEvent.layout;
    spots.current[index] = { x: left, width: w };
    // A new number each time, so a re-measure (rotation, a language with
    // longer words) moves the pill as well as the first one does.
    setMeasured((n) => n + 1);
  };

  useEffect(() => {
    const spot = spots.current[selected];
    if (!spot) return;
    if (!placed.current || still) {
      x.value = spot.x;
      width.value = spot.width;
      placed.current = true;
      return;
    }
    x.value = withTiming(spot.x, SLIDE);
    width.value = withTiming(spot.width, SLIDE);
  }, [selected, measured, still, x, width]);

  const style = useAnimatedStyle(() => ({
    width: width.value,
    transform: [{ translateX: x.value }],
  }));

  /**
   * The pill. Draw it first inside the track so the options sit on top.
   * A function, not a component: a component made here would be a new type
   * on every render, remounted, and its slide cut short.
   */
  const knob = (look?: StyleProp<ViewStyle>) => (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: "absolute", left: 0, top: 0, bottom: 0 },
        look,
        style,
        // Hidden until the chosen option has been measured, so it does not
        // flash at the left edge on the first frame.
        { opacity: spots.current[selected] ? 1 : 0 },
      ]}
    />
  );

  return { onOptionLayout, knob };
}
