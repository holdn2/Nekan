/**
 * Ported from the watermelon component registry
 * (scratchpad/watermelon/tooltip.tsx), MIT licensed --
 * Copyright (c) 2026 Watermelon Platform Contributors.
 *
 * Kept verbatim: every `data-slot`, the `TooltipProvider`'s `delayDuration`
 * default of `0`, and the arrow-inside-content structure (`TooltipContent`
 * renders `children` followed by `TooltipPrimitive.Arrow`, not the other way
 * around -- the arrow has to paint after the content in source order for its
 * `translate-y` offset to sit against the content's edge).
 *
 * DEVIATIONS FROM UPSTREAM, AND WHY:
 *
 * 1. `"use client"` DROPPED. That directive is a Next.js/React Server
 *    Components marker with no meaning in a Vite-bundled Electron renderer --
 *    there is no server boundary here for it to cross.
 *
 * 2. `radix-ui` UMBRELLA PACKAGE, NOT INSTALLED. Same substitution as
 *    `popover.tsx`: `{ Tooltip as TooltipPrimitive } from "radix-ui"`
 *    becomes `import * as TooltipPrimitive from "@radix-ui/react-tooltip"`.
 *
 * 3. NO `asChild`. Not used upstream in this file; noted for the same reason
 *    as `popover.tsx`.
 *
 * 4. ENTER/EXIT ANIMATION UTILITIES DROPPED, for the same reason as
 *    `popover.tsx`: `animate-in`/`animate-out`, `fade-in-0`/`fade-out-0`,
 *    `zoom-in-95`/`zoom-out-95`, the four `slide-in-from-*-2` variants (both
 *    the `data-open`/`data-closed` pair and the `data-[state=delayed-open]`
 *    duplicate of the same three), and the
 *    `origin-(--radix-tooltip-content-transform-origin)` utility that pivoted
 *    them, all depend on the `tailwindcss-animate` plugin, which this app
 *    does not have installed. Dropped rather than left as dead class names;
 *    the tooltip still shows and hides on Radix's own open state, just
 *    without a fade/zoom.
 *
 * 5. TOKENS. `bg-foreground text-background` -> `bg-accent text-on-accent`:
 *    upstream's tooltip is deliberately the *inverse* surface (dark chip on a
 *    light page, light chip on a dark one), which is exactly what this
 *    app's ink accent already is -- the same pairing `button.tsx`'s
 *    `default` variant uses. The arrow's `bg-foreground fill-foreground`
 *    becomes `bg-accent fill-accent` to match.
 *
 * 6. SPACING. `px-3` (12px) -> `px-xl`, `py-1.5` (6px) -> `py-sm`, `size-2.5`
 *    (10px, the arrow) -> `size-lg`. `rounded-[2px]` and
 *    `translate-y-[calc(-50%_-_2px)]` were already arbitrary values upstream
 *    and are kept as-is -- neither depends on this app's named-step scale.
 *
 * 7. RADIUS. Upstream's `rounded-md` is one step below its base radius
 *    (`button.tsx`'s file comment measured that base, `rounded-lg`, at 8px --
 *    shadcn-derived scales set `md` two pixels under `lg`, so upstream's
 *    `md` is 6px). This app's `rounded-md` is 8px (`--radius-md` in
 *    `styles/index.css`); matching the pixel rather than the name makes it
 *    `rounded-sm` (6px, `--radius-sm`).
 */

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "../../react/cn.js";

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "rounded-sm px-xl py-sm text-xs bg-accent text-on-accent z-50 w-fit max-w-[20rem]",
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="size-lg rotate-45 rounded-[2px] bg-accent fill-accent z-50 translate-y-[calc(-50%_-_2px)]" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
