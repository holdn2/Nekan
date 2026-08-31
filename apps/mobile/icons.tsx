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
import Svg, { Line } from "react-native-svg";

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
