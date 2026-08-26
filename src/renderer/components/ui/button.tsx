/**
 * Ported from the watermelon component registry
 * (scratchpad/watermelon/button.tsx), MIT licensed --
 * Copyright (c) 2026 Watermelon Platform Contributors.
 *
 * Kept verbatim: the `cva` variant/size split, the `data-slot` /
 * `data-variant` / `data-size` attributes, and every selector that is not a
 * colour or a spacing number (aria-invalid, aria-expanded, has-data-[icon],
 * focus-visible, disabled).
 *
 * DEVIATIONS FROM UPSTREAM, AND WHY:
 *
 * 1. NO `asChild`. Upstream renders `Slot.Root` (from the `radix-ui` umbrella
 *    package) when `asChild` is set, so a caller can hand the button's classes
 *    to an `<a>` or another element instead of a `<button>`. That package is
 *    not a dependency here and is not worth adding for one prop; `Button`
 *    always renders `<button>`, and `asChild`/`Slot` are gone. The `[a]:` state
 *    variant on the `default` variant (for when the rendered tag was an
 *    anchor) is dropped for the same reason -- it can never match now.
 *
 * 2. ICONS ARE LUCIDE, NOT HUGEICONS. This file has no icons of its own, but
 *    ui/calendar.tsx (the other half of this port) draws its Chevron with
 *    `lucide-react`, matching every other icon in this renderer.
 *
 * 3. TOKENS. Upstream's `bg-primary`/`text-primary-foreground`,
 *    `bg-secondary`/`text-secondary-foreground`, `bg-muted`,
 *    `bg-background`, `border-border`/`border-input`, `border-ring`,
 *    `text-destructive`/`bg-destructive` do not exist in this app's palette
 *    (`src/shared/theme.ts`). Mapped to `bg-accent`/`text-on-accent`,
 *    `bg-panel-3`/`text-text`, `bg-panel-2`, `bg-panel`, `border-line`,
 *    `border-line-strong`, `text-danger`/`bg-danger-soft`, per the table in
 *    the task that produced this file. `ring-ring` keeps its name -- this
 *    palette has a `--ring` token already sized for a focus ring, so the
 *    `/50` opacity upstream applies on top is dropped rather than compounded
 *    on top of an already-transparent colour.
 *
 *    Every `dark:` variant upstream carries is dropped, not translated. This
 *    palette does not select dark mode with a class-scoped override the way
 *    upstream's does -- `bg-panel-2` etc. are CSS custom properties that
 *    already resolve to a different value under `[data-theme="dark"]` (see
 *    `styles/palette.css`), so a second, hand-written dark rule here would be
 *    redundant at best and a second place to keep in sync at worst.
 *
 * 4. SPACING. This app defines no numeric `--spacing` scale (see
 *    `styles/index.css`) -- only named steps. Tailwind's default scale is
 *    `n * 4px`, and every one of upstream's numeric utilities converts
 *    exactly onto a named step at that same pixel value (`h-8` = 32px =
 *    `h-6xl`, `px-2.5` = 10px = `px-lg`, `gap-1` = 4px = `gap-xs`, ...).
 *    `h-7`/`h-9`/`size-7`/`size-9` (28px/36px) have no named step and become
 *    arbitrary `[28px]`/`[36px]` values, which the task calls out as the
 *    expected escape hatch for those two sizes.
 *
 * 5. RADIUS. Upstream's base radius is `rounded-lg`. That was first read as
 *    8px, which was wrong: watermelon's `src/index.css` sets
 *    `--radius: 0.625rem`, so their scale is sm 6 / md 8 / lg 10 / xl 14, and
 *    the base is 10px. Ours has a 10px step called `rounded-panel`, so that is
 *    what the base maps to. The `xs`/`sm` sizes below are unaffected: their
 *    `min(var(--radius-md), 10px)` resolves to 8px on either reading, and
 *    `rounded-md` is 8px here too.
 *    This app's `rounded-lg` is 12px (`shared/theme.ts` -- Radius steps
 *    are `xs 4 * sm 6 * md 8 * panel 10 * lg 12 * pill`). Matched on the pixel,
 *    not the name, so the base class became `rounded-md`. The `xs`/`sm` sizes'
 *    `rounded-[min(var(--radius-md),10px)]` / `...,12px)]` formulas exist
 *    upstream to cap a *bigger* radius token down for a small button; this
 *    palette's `--radius-md` is already 8px, smaller than both caps, so the
 *    `min()` always resolves to it and the formula collapses to plain
 *    `rounded-md`.
 *
 * 6. BUTTON GROUPS NOT PORTED. Upstream's `xs`/`sm` sizes carry
 *    `in-data-[slot=button-group]:rounded-lg`, styling for a `ButtonGroup`
 *    component this task did not ask for and this app has no other use for.
 *    Dropped rather than carried as dead weight; add it back if a
 *    `ButtonGroup` is ever ported too.
 *
 * 7. `bg-transparent` ADDED TO THE BASE CLASSES. Not in upstream at all --
 *    upstream can leave a button's resting background unset because the
 *    Tailwind preset it sits on top of imports `preflight.css`, whose
 *    `button { background-color: transparent; }` already erases the
 *    browser's native chrome before any variant runs. This app imports only
 *    `tailwindcss/utilities.css` (see `styles/index.css`) and never
 *    preflight, and `base.css`'s own `button` reset only sets `font`,
 *    `color`, and `cursor` -- not `background`. Without this line every
 *    `ghost`-variant button (every day cell in the ported calendar, among
 *    others) showed the OS's default button fill at rest, which read as an
 *    unwanted grey box on ordinary, unselected days. Placed in the base
 *    string, before any variant's own background utility, so `bg-transparent`
 *    only wins where a variant does not set one of its own -- verified in the
 *    built CSS rather than assumed (see the port's verification notes).
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../react/cn.js";

const buttonVariants = cva(
  "bg-transparent focus-visible:border-line-strong focus-visible:ring-ring aria-invalid:ring-danger/20 aria-invalid:border-danger rounded-panel border border-transparent bg-clip-padding text-sm font-medium focus-visible:ring-3 aria-invalid:ring-3 [&_svg:not([class*='size-'])]:size-3xl inline-flex items-center justify-center whitespace-nowrap transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none shrink-0 [&_svg]:shrink-0 outline-none group/button select-none",
  {
    variants: {
      variant: {
        default: "bg-accent text-on-accent hover:bg-accent/80",
        outline:
          "border-line bg-panel hover:bg-panel-2 hover:text-text aria-expanded:bg-panel-2 aria-expanded:text-text",
        secondary:
          "bg-panel-3 text-text hover:bg-panel-3/80 aria-expanded:bg-panel-3 aria-expanded:text-text",
        ghost:
          "hover:bg-panel-2 hover:text-text aria-expanded:bg-panel-2 aria-expanded:text-text",
        destructive:
          "bg-danger/10 hover:bg-danger/20 focus-visible:ring-danger/20 text-danger focus-visible:border-danger/40",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-6xl gap-sm px-lg has-data-[icon=inline-end]:pr-md has-data-[icon=inline-start]:pl-md",
        xs: "h-5xl gap-xs rounded-md px-md text-xs has-data-[icon=inline-end]:pr-sm has-data-[icon=inline-start]:pl-sm [&_svg:not([class*='size-'])]:size-xl",
        sm: "h-[28px] gap-xs rounded-md px-lg text-xs has-data-[icon=inline-end]:pr-sm has-data-[icon=inline-start]:pl-sm [&_svg:not([class*='size-'])]:size-2xl",
        lg: "h-[36px] gap-sm px-lg has-data-[icon=inline-end]:pr-xl has-data-[icon=inline-start]:pl-xl",
        icon: "size-6xl",
        "icon-xs": "size-5xl rounded-md [&_svg:not([class*='size-'])]:size-xl",
        "icon-sm": "size-[28px] rounded-md",
        "icon-lg": "size-[36px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
