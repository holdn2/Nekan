/**
 * Icons, drawn rather than typed.
 *
 * A `×` in a close button is the face of a control, not part of a sentence,
 * and a glyph sits where the font puts it -- on the mathematical axis, not the
 * middle of its box. The desktop measured that offset once and stopped
 * fighting it; a shape centred in a viewBox has none of it, and it never ends
 * up in a translation catalogue by accident.
 *
 * Weight and size are decided here, not at the call sites, and the colour is
 * passed in rather than baked so a theme or a state can carry it.
 *
 * The name belongs to the button, not to the icon: these are marked hidden
 * from the accessibility tree and the Pressable around them carries the label.
 */
import Svg, { Circle, Line, Path, Polyline, Rect } from "react-native-svg";

interface IconProps {
  color: string;
  size?: number;
}

const STROKE = 1.75;

export function CloseIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={STROKE}
      strokeLinecap="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Line x1="6" y1="6" x2="18" y2="18" />
      <Line x1="18" y1="6" x2="6" y2="18" />
    </Svg>
  );
}

/** The face of a row that leads somewhere. A `>` in a font is not it. */
export function ChevronIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Polyline points="9 5 16 12 9 19" />
    </Svg>
  );
}

export function PlusIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={STROKE}
      strokeLinecap="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Line x1="12" y1="5" x2="12" y2="19" />
      <Line x1="5" y1="12" x2="19" y2="12" />
    </Svg>
  );
}

/**
 * The completion control: an outline that fills and takes a tick.
 *
 * One component with a `done` flag rather than two icons, so the two states
 * cannot drift in size or stroke -- they sit in the same box and the tick is
 * drawn on the same grid as the ring.
 *
 * The tick's colour is passed in rather than assumed white: it sits on the
 * ring's fill, so the two have to be chosen together, and a literal here would
 * be a colour living outside theme.ts.
 */
export function CheckCircleIcon({
  color,
  tickColor,
  size = 22,
  done = false,
}: IconProps & { tickColor: string; done?: boolean }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Circle cx="12" cy="12" r="9" fill={done ? color : "none"} />
      {done ? (
        <Polyline points="8,12.5 11,15.5 16,9.5" stroke={tickColor} />
      ) : null}
    </Svg>
  );
}

/** A note exists on this row. Filled, because it is a state and not an action. */
export function MemoIcon({ color, size = 14 }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={STROKE}
      strokeLinecap="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path d="M4 6h16M4 12h16M4 18h9" />
    </Svg>
  );
}

/**
 * "Sync now". Lucide's `refresh-cw`, path for path, so the two apps draw the
 * same mark -- two arrows chasing each other round a circle, because syncing
 * goes both ways. A single arrow reads as reload, which is half the story.
 */
export function SyncIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <Path d="M21 3v5h-5" />
      <Path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <Path d="M8 16H3v5" />
    </Svg>
  );
}

export function MicIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <Path d="M5 11v1a7 7 0 0 0 14 0v-1" />
      <Line x1="12" y1="19" x2="12" y2="22" />
    </Svg>
  );
}

/**
 * Listening: a filled square, the universal "stop", inside the same circle the
 * microphone sat in. Filled rather than outlined because the state it marks is
 * the one where pressing again *ends* something -- an outline would read as
 * one more thing to start.
 */
export function StopIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      stroke="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Rect x="7" y="7" width="10" height="10" rx="2" />
    </Svg>
  );
}
