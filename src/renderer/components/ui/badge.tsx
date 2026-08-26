/**
 * Ported from the watermelon component registry
 * (scratchpad/watermelon/badge.tsx), MIT licensed --
 * Copyright (c) 2026 Watermelon Platform Contributors.
 *
 * Kept verbatim: the `cva` variant split, the `data-slot`/`data-variant`
 * attributes, and every selector that is not a colour or a spacing number
 * (aria-invalid, focus-visible, has-data-[icon=...], the `[&>svg]` icon
 * rules).
 *
 * NOTE ON THE NAME: this app already has a `Badge` at
 * `src/renderer/components/badge.tsx` -- the small count pill used in the tab
 * strip and the brain dump header. That one is unrelated and unaffected: it
 * takes no `variant` prop, is not built on `cva`, and lives at a different
 * import path (`components/badge.js` vs `components/ui/badge.js`). Nothing
 * here changes it or imports it.
 *
 * DEVIATIONS FROM UPSTREAM, AND WHY:
 *
 * 1. NO `asChild`. Same reasoning as ui/button.tsx: `Slot.Root` comes from the
 *    `radix-ui` umbrella package, which is not a dependency here. `Badge`
 *    always renders `<span>`.
 *
 *    That in turn makes every `[a]:hover:...` state upstream carries on the
 *    `default`/`secondary`/`destructive`/`outline` variants dead code: it only
 *    ever matched a badge rendered as `asChild` onto an `<a>`, which can no
 *    longer happen. Dropped outright rather than converted to a plain
 *    `hover:`, the same treatment ui/button.tsx gives its own `[a]:` state --
 *    upstream's own source never gives those four variants a hover that is
 *    not gated behind `[a]:`, so a plain span in those variants was always
 *    meant to be static, and stays that way. `ghost` and `link` are
 *    unaffected: upstream never gated their hovers behind `[a]:`.
 *
 * 2. TOKENS. `bg-primary`/`text-primary-foreground` -> `bg-accent`/
 *    `text-on-accent`; `bg-secondary`/`text-secondary-foreground` ->
 *    `bg-panel-3`/`text-text`; `border-border` -> `border-line`;
 *    `text-foreground` -> `text-text`; `text-muted-foreground` -> `text-muted`
 *    (this palette has no separate "foreground" pairing); `focus-visible:
 *    border-ring` -> `focus-visible:border-line-strong`; `focus-visible:
 *    ring-ring/50` -> `focus-visible:ring-ring` (the `/50` is not stacked on
 *    top of an already-translucent token, per ui/button.tsx's file comment).
 *
 *    `destructive` keeps upstream's opacity-modifier shape rather than
 *    collapsing to the fixed `bg-danger-soft` token, matching ui/button.tsx's
 *    own destructive variant: `bg-destructive/10` -> `bg-danger/10`,
 *    `aria-invalid:ring-destructive/20` -> `aria-invalid:ring-danger/20`,
 *    `text-destructive` -> `text-danger`, `aria-invalid:border-destructive`
 *    -> `aria-invalid:border-danger`. A fixed `bg-danger-soft` cannot express
 *    upstream's two-step "10% resting" idea on its own, and this keeps this
 *    file consistent with the sibling port that already made that call.
 *
 *    Every `dark:` variant is dropped, not translated -- this palette's
 *    tokens already answer `[data-theme="dark"]` on their own (see
 *    ui/button.tsx's file comment for the full reasoning).
 *
 * 3. SPACING. `h-5` (20px) -> `h-4xl`; `gap-1` (4px) -> `gap-xs`; `px-2`
 *    (8px) -> `px-md`; `py-0.5` (2px) -> `py-2xs`; `has-data-[icon=
 *    inline-end]:pr-1.5` / `has-data-[icon=inline-start]:pl-1.5` (6px) ->
 *    `pr-sm`/`pl-sm`; `[&>svg]:size-3!` (12px) -> `[&>svg]:size-xl!` (the
 *    trailing `!` is Tailwind's own important-modifier syntax, kept as-is --
 *    it is not a spacing number). `focus-visible:ring-[3px]` becomes
 *    `focus-visible:ring-3`, matching the un-bracketed form ui/button.tsx
 *    already uses for the same ring width.
 *
 * 4. RADIUS. Upstream's `rounded-4xl` is a 32px radius on a 20px-tall badge --
 *    already well past half the box's height, so the visible shape is a full
 *    pill regardless of exactly how far past it the radius goes. This app
 *    names that shape directly: `rounded-pill` (999px, see
 *    `src/renderer/react/cn.ts`'s `RADIUS` list), which every other pill in
 *    this renderer already reaches for (the tab-strip count badge, the
 *    toasts, the archive/title-bar chips -- see their `rounded-pill` calls).
 *    Matched on the resulting shape rather than the literal pixel, since no
 *    named step in this app's scale sits anywhere near 32px and an arbitrary
 *    `[32px]` would produce a visually identical pill while breaking the
 *    convention every sibling pill in this codebase already follows.
 *
 * 5. NO `bg-transparent` NEEDED. ui/button.tsx and ui/calendar.tsx both had to
 *    add `bg-transparent` to their base classes because this app has no
 *    preflight and a bare `<button>` keeps the OS's own chrome. `Badge`
 *    renders `<span>`, which has no such native styling to begin with -- a
 *    `<span>` is already background-transparent at rest, so the `ghost`
 *    variant's bare `hover:bg-panel-2` (no resting background of its own)
 *    needs nothing extra here.
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../react/cn.js";

const badgeVariants = cva(
  "h-4xl gap-xs rounded-pill border border-transparent px-md py-2xs text-xs font-medium transition-all has-data-[icon=inline-end]:pr-sm has-data-[icon=inline-start]:pl-sm [&>svg]:size-xl! inline-flex items-center justify-center w-fit whitespace-nowrap shrink-0 [&>svg]:pointer-events-none focus-visible:border-line-strong focus-visible:ring-ring focus-visible:ring-3 aria-invalid:ring-danger/20 aria-invalid:border-danger overflow-hidden group/badge",
  {
    variants: {
      variant: {
        default: "bg-accent text-on-accent",
        secondary: "bg-panel-3 text-text",
        destructive: "bg-danger/10 focus-visible:ring-danger/20 text-danger",
        outline: "border-line text-text",
        ghost: "hover:bg-panel-2 hover:text-muted",
        link: "text-accent underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
