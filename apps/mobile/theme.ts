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
import { PALETTE, type ColorRole, type ThemeName } from "@nekan/shared/theme";

export type Colors = Record<ColorRole, string>;

/** The phone's setting, defaulting the way the desktop does when unset. */
export function useThemeName(): ThemeName {
  return useColorScheme() === "dark" ? "dark" : "light";
}

export function useColors(): Colors {
  return PALETTE[useThemeName()];
}

/**
 * Named steps, not numbers -- the same scale the desktop uses, so a value can
 * be moved between the two without translating it. Tailwind holds these on the
 * web side; here they are the object itself.
 */
export const SP = {
  hair: 1,
  "2xs": 2,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  "2xl": 14,
  "3xl": 16,
  "4xl": 20,
  "5xl": 24,
  "6xl": 32,
  "7xl": 40,
} as const;
