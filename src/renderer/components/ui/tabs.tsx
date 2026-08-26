/**
 * Ported from the watermelon component registry
 * (scratchpad/watermelon/tabs.tsx), MIT licensed --
 * Copyright (c) 2026 Watermelon Platform Contributors.
 *
 * This is a NEW primitive for future callers, not the app's own tab strip.
 * `src/renderer/window/chrome/tabs.tsx` draws the four top tabs already and
 * is untouched by this file.
 *
 * Kept verbatim: the `data-slot` attributes on every part, the `cva`
 * variant split on `TabsList`, and the whole layout idea -- a horizontal
 * strip is the *root* going `flex-col` (list on top, panel below) while a
 * vertical strip leaves the root's default row direction alone, so only one
 * of the two orientations needs an override.
 *
 * DEVIATIONS FROM UPSTREAM, AND WHY:
 *
 * 1. NO "use client". Next.js-only, meaningless to Vite/Electron; harmless
 *    as a stray string literal but not worth carrying.
 *
 * 2. RADIX IMPORT. Upstream imports the `radix-ui` umbrella package
 *    (`import { Tabs as TabsPrimitive } from "radix-ui"`), which is not a
 *    dependency here -- only the scoped `@radix-ui/react-tabs` package is
 *    installed. `import * as TabsPrimitive from "@radix-ui/react-tabs"`
 *    exposes the same `Root`/`List`/`Trigger`/`Content` members.
 *
 * 3. `data-horizontal:` / `group-data-horizontal/tabs:` / `data-active:` and
 *    their `vertical`/`inactive` counterparts do not compile here. Upstream
 *    can write a bare word after `data-` because its Tailwind config extends
 *    `theme.data` with shortcuts (`horizontal: 'orientation="horizontal"'`,
 *    `active: 'state="active"'`, and so on) -- the same mechanism this app
 *    already relies on for `aria-invalid:` / `aria-expanded:` in
 *    ui/button.tsx, except those are Tailwind v4 *defaults* and these data
 *    shortcuts are not; nothing in `styles/index.css` defines them. Written
 *    out, every one of them is what Radix actually puts on the DOM node:
 *    `TabsPrimitive.Root` sets `data-orientation="horizontal"|"vertical"`,
 *    `TabsPrimitive.Trigger` sets `data-state="active"|"inactive"`. So
 *    `data-horizontal:flex-col` -> `data-[orientation=horizontal]:flex-col`,
 *    `group-data-vertical/tabs:` -> `group-data-[orientation=vertical]/tabs:`,
 *    `data-active:` -> `data-[state=active]:`, throughout. This is a syntax
 *    change only -- the selector each one resolves to is identical to what
 *    upstream's shortcut expanded to, and calendar.tsx already keeps the
 *    bracket form verbatim for `data-[selected=true]:ring-0`, so this file
 *    is not introducing a new pattern, only using it in the one place
 *    upstream had a shortcut for it. Left as shorthand, these classes would
 *    not compile to anything: Tailwind only makes a variant of an unknown
 *    plain word if a `--data-<word>` theme entry names it, and there isn't
 *    one -- the tab would keep switching (Radix does that itself) but would
 *    never visibly select.
 *
 * 4. TOKENS. `text-foreground` -> `text-text`; `text-muted-foreground` (not
 *    a token here) -> `text-muted`; `bg-background` -> `bg-panel`;
 *    `bg-muted` -> `bg-panel-2`; `border-ring` -> `border-line-strong`;
 *    `ring-ring/50` -> `ring-ring` (this palette's `--ring` is already
 *    translucent -- see ui/button.tsx's file comment for why the `/50` is
 *    not stacked on top of it); `after:bg-foreground` -> `after:bg-text`.
 *    Every `dark:` variant is dropped outright, not translated -- these
 *    tokens are CSS custom properties that already answer
 *    `[data-theme="dark"]` on their own.
 *
 * 5. SHADOW. `shadow-sm` (the lift a `default`-variant active tab gets) has
 *    no match in this app's five-shadow scale (`default`/`knob`/`even`/
 *    `pop`/`toast`). `shadow-default` is the general-purpose elevation this
 *    app already uses for ordinary raised surfaces, so it is the closest
 *    read for "this tab is the one on top" -- there is no scale to match a
 *    "sm" against, only a judgement call.
 *
 * 6. SPACING AND RADIUS. No numeric `--spacing` scale here, only named
 *    steps, and Tailwind's zero-value utilities do not compile without one
 *    (`inset-x-0` -> `inset-x-[0px]`, same reasoning as calendar.tsx's file
 *    comment, point 3). Every other numeric utility converts onto a named
 *    step at the same pixel value at Tailwind's default 4px unit: `gap-2` ->
 *    `gap-md`, `gap-1` -> `gap-xs`, `px-1.5` -> `px-sm`, `py-0.5` -> `py-2xs`,
 *    `size-4` -> `size-3xl`, `h-8` -> `h-6xl`, `h-0.5`/`w-0.5` -> `h-2xs`/
 *    `w-2xs`, `-right-1` -> `-right-xs`. Radius is matched on the pixel, not
 *    the name: watermelon's `--radius` base is `0.625rem` (10px), and its
 *    scale is the standard shadcn derivation from that base (`sm` = base -
 *    4px, `md` = base - 2px, `lg` = base), which makes upstream's
 *    `rounded-lg` (List) 10px and `rounded-md` (Trigger) 8px. This app's
 *    scale (`xs 4 * sm 6 * md 8 * panel 10 * lg 12 * pill`) has an exact
 *    match for both, at different names: `rounded-panel` (10px) and
 *    `rounded-md` (8px).
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "../../react/cn.js";

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "gap-md group/tabs flex data-[orientation=horizontal]:flex-col",
        className,
      )}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  "rounded-panel p-[3px] group-data-[orientation=horizontal]/tabs:h-6xl data-[variant=line]:rounded-none group/tabs-list text-muted inline-flex w-fit items-center justify-center group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
  {
    variants: {
      variant: {
        default: "bg-panel-2",
        line: "gap-xs bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "gap-sm rounded-md border border-transparent px-sm py-2xs text-sm font-medium group-data-[variant=default]/tabs-list:data-[state=active]:shadow-default group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none [&_svg:not([class*='size-'])]:size-3xl focus-visible:border-line-strong focus-visible:ring-ring focus-visible:outline-ring text-text/60 hover:text-text relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center whitespace-nowrap transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent",
        "data-[state=active]:bg-panel data-[state=active]:text-text",
        "after:bg-text after:absolute after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-[0px] group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-2xs group-data-[orientation=vertical]/tabs:after:inset-y-[0px] group-data-[orientation=vertical]/tabs:after:-right-xs group-data-[orientation=vertical]/tabs:after:w-2xs group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("text-sm flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
