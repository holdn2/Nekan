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
import Svg, { Circle, Line, Path, Polyline } from "react-native-svg";

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
