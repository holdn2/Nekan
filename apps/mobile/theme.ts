/**
 * The palette, as React Native wants it.
 *
 * No colours are defined here. `@nekan/shared/theme` is the one place they
 * live, and it already carries both themes; this only picks the one the phone
 * is set to and hands back plain strings, because RN has no cascade to inherit
 * them through.
 *
 * The desktop reaches the same values through generated CSS custom properties.
 * That generator and this hook are two readers of one source, which is why a
 * colour changed in theme.ts shows up in both without being typed twice.
 */
import { useColorScheme } from "react-native";
import {
  FONT_SIZE,
  FONT_WEIGHT,
  PALETTE,
  RADIUS,
  SPACING,
  type ColorRole,
  type ThemeName,
} from "@nekan/shared/theme";

export type Colors = Record<ColorRole, string>;

/** The phone's setting, defaulting the way the desktop does when unset. */
export function useThemeName(): ThemeName {
  return useColorScheme() === "dark" ? "dark" : "light";
}

export function useColors(): Colors {
  return PALETTE[useThemeName()];
}

/**
 * The scale, re-exported under short names.
 *
 * Not defined here. `@nekan/shared/theme` holds the numbers and the desktop
 * reads the same ones through CSS custom properties, so a step changed there
 * moves both screens -- `tools/check-scale.js` fails if the two ever disagree.
 * The names are short because they appear in almost every style object.
 */
export const SP = SPACING;
export const R = RADIUS;
export const FS = FONT_SIZE;
export const FW = FONT_WEIGHT;
