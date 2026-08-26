/**
 * Ported from the watermelon component registry
 * (scratchpad/watermelon/card.tsx), MIT licensed --
 * Copyright (c) 2026 Watermelon Platform Contributors.
 *
 * Kept verbatim: every `data-slot`, the `size` prop (`"default" | "sm"`) and
 * every `data-[size=sm]`/`group-data-[size=sm]/card` selector that reacts to
 * it, the `has-data-[slot=...]` selectors that trim padding around a footer
 * or a leading/trailing image, and the `@container/card-header` on
 * `CardHeader` (a container query, independent of this app's spacing scale,
 * so nothing about it needed to change).
 *
 * This file has no Radix dependency -- every element is a plain `<div>` (or
 * `<p>` for `CardDescription`), so unlike `popover.tsx`/`tooltip.tsx` there
 * is no primitive package to swap out.
 *
 * DEVIATIONS FROM UPSTREAM, AND WHY:
 *
 * 1. TOKENS. `bg-card`/`text-card-foreground` -> `bg-panel`/`text-text`
 *    (this palette has no `-foreground` suffix family -- see `button.tsx`'s
 *    file comment). `text-muted-foreground` -> `text-muted`.
 *    `ring-foreground/10` -> `ring-line`, same substitution and same reason
 *    as `popover.tsx`: `line` is already this palette's subtle-border tone
 *    in both themes, which is what a 10% tint of the foreground colour was
 *    standing in for. `bg-muted/50` -> `bg-panel-2/50`: kept the opacity
 *    modifier rather than dropping it, because Tailwind can apply one to any
 *    theme colour (this app already does, e.g. `button.tsx`'s
 *    `hover:bg-accent/80`) -- there was no reason to throw away information
 *    upstream chose to express, the way the `ring`/`50` pairing in
 *    `button.tsx` had to be (that one was dropped because `--ring` is
 *    *already* a translucent colour and stacking a second opacity on it
 *    would compound, not because opacity modifiers do not work here).
 *
 * 2. SPACING. No numeric `--spacing` scale exists in this app (see
 *    `button.tsx`'s file comment). Every `gap-N`/`p-N`/`px-N`/`py-N`/`pb-N`
 *    converts onto a named step at the same pixel value: `gap-4`/`py-4`/
 *    `px-4`/`p-4` (16px) -> `-3xl`, `gap-1` (4px) -> `-xs`, `gap-3`/`py-3`/
 *    `px-3`/`p-3` (12px) -> `-xl`. The zero utilities (`pb-0`, `pt-0`) have
 *    no named step either -- there is no `spacing-0` -- and become the
 *    arbitrary `[0px]`, the same escape hatch `calendar.tsx`'s port used for
 *    its own zero utilities.
 *
 * 3. TEXT SIZE. `text-base` has no equivalent in this app's named scale
 *    (`text-xs` through `text-3xl`, no bare "base" step -- see
 *    `src/renderer/react/cn.ts`'s `TEXT` list). Upstream's `text-base` is
 *    16px, which this app's own scale gives to `text-xl`
 *    (`--fs-xl: 16px` in `styles/base.css`) -- matched on the pixel, not the
 *    name, same rule `button.tsx` and `calendar.tsx` apply to spacing and
 *    radius.
 *
 * 4. RADIUS. Upstream's `rounded-xl` is one step above its base radius,
 *    which `button.tsx`'s file comment measured at 8px (`rounded-lg`
 *    upstream) -- shadcn-derived scales set `xl` four pixels over that base,
 *    so upstream's `xl` is 12px. This app's `rounded-lg` is exactly 12px
 *    (`--radius-lg` in `styles/index.css`), so `rounded-xl`/`rounded-t-xl`/
 *    `rounded-b-xl` all become `rounded-lg`/`rounded-t-lg`/`rounded-b-lg`.
 */

import * as React from "react";

import { cn } from "../../react/cn.js";

function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "ring-line bg-panel text-text gap-3xl overflow-hidden rounded-lg py-3xl text-sm ring-1 has-data-[slot=card-footer]:pb-[0px] has-[>img:first-child]:pt-[0px] data-[size=sm]:gap-xl data-[size=sm]:py-xl data-[size=sm]:has-data-[slot=card-footer]:pb-[0px] *:[img:first-child]:rounded-t-lg *:[img:last-child]:rounded-b-lg group/card flex flex-col",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "gap-xs rounded-t-lg px-3xl group-data-[size=sm]/card:px-xl [.border-b]:pb-3xl group-data-[size=sm]/card:[.border-b]:pb-xl group/card-header @container/card-header grid auto-rows-min items-start has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto]",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "text-xl leading-snug font-medium group-data-[size=sm]/card:text-sm",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted text-sm", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-3xl group-data-[size=sm]/card:px-xl", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "bg-panel-2/50 rounded-b-lg border-t p-3xl group-data-[size=sm]/card:p-xl flex items-center",
        className,
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
