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
import { themeChoice } from "./store/state";
import { useStore } from "./store/use-store";
import {
  FONT_SIZE,
  FONT_WEIGHT,
  LINE_HEIGHT,
  PALETTE,
  RADIUS,
  SPACING,
  type ColorRole,
  type ThemeName,
} from "@nekan/shared/theme";

export type Colors = Record<ColorRole, string>;

/**
 * The stored choice, or the device when there is none.
 *
 * Reading the device is the fallback rather than the rule: the system decides
 * the first launch and nothing after it, which is what "follow the system"
 * has to mean for a setting a person can then change. `useStore` is what
 * makes the change land -- the choice lives in the store, so every screen
 * already listening for a task redraws for a colour too.
 */
export function useThemeName(): ThemeName {
  useStore();
  const device = useColorScheme() === "dark" ? "dark" : "light";
  return themeChoice() ?? device;
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
export const LH = LINE_HEIGHT;
