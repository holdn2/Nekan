/**
 * Ported from the watermelon component registry
 * (scratchpad/watermelon/alert-dialog.tsx), MIT licensed --
 * Copyright (c) 2026 Watermelon Platform Contributors.
 *
 * Not wired to anything yet -- the comment on each part explains what
 * changed and why, so a future caller (the eventual `confirm()` replacement)
 * can trust the shape without re-deriving it. Focus handling and
 * Escape-to-close are untouched: they are Radix's own behaviour, and the
 * entire reason to take this file instead of writing one is to keep them.
 *
 * DEVIATIONS FROM UPSTREAM, AND WHY:
 *
 * 1. RADIX IMPORT. Upstream imports the `radix-ui` umbrella package
 *    (`import { AlertDialog as AlertDialogPrimitive } from "radix-ui"`),
 *    which is not a dependency here -- only the scoped
 *    `@radix-ui/react-alert-dialog` package is installed.
 *    `import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"`
 *    exposes the same members (`Root`, `Trigger`, `Portal`, `Overlay`,
 *    `Content`, `Title`, `Description`, `Action`, `Cancel`).
 *
 * 2. `asChild` IS GONE, AND SO IS THE `<Button>` WRAPPER -- not just because
 *    the `radix-ui` umbrella's `Slot` is unavailable (this app's own
 *    ui/button.tsx already dropped `asChild` for that reason), but because
 *    once `Button` cannot forward its classes onto a child, wrapping
 *    `<Button asChild><AlertDialogPrimitive.Action /></Button>` would nest a
 *    Radix `Action`/`Cancel` -- both of which render a `<button>` by default
 *    -- *inside* the `<button>` our own `Button` always renders, which is
 *    invalid HTML (a button cannot contain a button). `AlertDialogAction`
 *    and `AlertDialogCancel` instead apply `buttonVariants({ variant, size
 *    })` as a className directly on the Radix primitive, the same way
 *    ui/calendar.tsx already applies the exported `buttonVariants` to
 *    `DayPicker`'s own nav buttons instead of wrapping them in `<Button>`.
 *    The look is identical; only the element tree is flatter.
 *
 * 3. NO ANIMATION UTILITIES. Upstream reaches for `animate-in`/`animate-out`/
 *    `fade-in-0`/`fade-out-0`/`zoom-in-95`/`zoom-out-95`/`duration-100`,
 *    which come from a Tailwind animation plugin (tw-animate-css or
 *    tailwindcss-animate) this app does not have and is not adding -- the
 *    only animations here run in hand-written CSS. Dropped outright: Radix
 *    still mounts and unmounts the overlay and content instantly on
 *    `open`/`onOpenChange`, so opening and closing both still work, just
 *    without a fade or a scale-in.
 *
 * 4. NO DIMMING OVERLAY. Upstream's overlay is `bg-black/10` -- and this
 *    app's palette has no "black" or scrim role at all (`bg-red-500` and
 *    friends are gone on purpose, see ui/button.tsx's file comment, point
 *    3). Rather than invent a new palette entry for a component nothing
 *    calls yet, the overlay is `bg-transparent`, matching the one dimming
 *    decision this app has already made out loud: the settings panel's own
 *    backdrop (`index.html`, `#settingsBackdrop`) is deliberately
 *    transparent, because "dimming the board behind a settings sheet would
 *    read as modal in a window that is 900px wide." An alert dialog is the
 *    same kind of widget-not-modal surface. The overlay still covers the
 *    window and still exists to catch a click outside the dialog -- only
 *    its paint is gone. `supports-backdrop-filter:backdrop-blur-xs` is
 *    dropped alongside it: this app defines no blur scale (no `--blur-*` in
 *    `styles/index.css`, which imports no Tailwind default theme at all),
 *    and a blur behind a backdrop with nothing to darken has nothing to do.
 *
 * 5. TOKENS. `bg-background` -> `bg-panel`; `bg-muted` -> `bg-panel-2`;
 *    `text-muted-foreground` (not a token here) -> `text-muted`;
 *    `text-foreground` -> `text-text`. `ring-foreground/10` (the dialog
 *    box's own outline, standing in for a border) -> `ring-line`, the same
 *    role `border-border`/`border-input` map to elsewhere in this port --
 *    the `/10` is dropped rather than compounded, the same reasoning
 *    ui/button.tsx gives for not stacking an opacity modifier onto an
 *    already-calibrated token.
 *
 * 6. `border-t` GAINS AN EXPLICIT COLOUR (`border-t border-line`, on the
 *    footer's divider). This app imports no Tailwind preflight, so nothing
 *    resets `border-style`/`border-color` to a known value the way upstream
 *    can rely on -- the same gap ui/button.tsx's file comment (point 7)
 *    documents for `background-color`. Every other border in this app's
 *    ported components already names a colour explicitly; this one is
 *    brought in line rather than left as the one bare exception.
 *
 * 7. SPACING AND RADIUS. No numeric `--spacing` scale, only named steps:
 *    `gap-4` -> `gap-3xl`, `gap-1.5` -> `gap-sm`, `gap-x-4` -> `gap-x-3xl`,
 *    `gap-2` -> `gap-md`, `p-4` -> `p-3xl`, `mb-2` -> `mb-md`,
 *    `-mx-4`/`-mb-4` -> `-mx-3xl`/`-mb-3xl`, `size-10` -> `size-7xl`,
 *    `size-6` -> `size-5xl` (all exact matches at Tailwind's default 4px
 *    unit). Radius is matched on the pixel, not the name: watermelon's
 *    `--radius` base is `0.625rem` (10px), giving `rounded-md` = 8px and
 *    `rounded-xl` = base + 4px = 14px in its scale. This app's scale
 *    (`xs 4 * sm 6 * md 8 * panel 10 * lg 12 * pill`) has an exact match for
 *    the first (`rounded-md`, Media, 8px) but not the second -- nothing here
 *    is 14px, so `rounded-xl`/`rounded-b-xl` (Content, Footer) become
 *    `rounded-lg`/`rounded-b-lg`, this app's *closest* step (12px), not an
 *    exact one.
 *
 * 8. `max-w-xs`/`max-w-sm` DO NOT COMPILE -- this app defines no
 *    `--container-*` scale (the max-width namespace), the same way it
 *    defines no blur scale, so these become arbitrary pixel values at
 *    Tailwind's own default sizing: `max-w-xs` (20rem) -> `max-w-[320px]`,
 *    `max-w-sm` (24rem) -> `max-w-[384px]`.
 *
 * 9. `text-base` -> `text-md`. This app's type scale is named
 *    `xs sm md lg xl 2xl 3xl` -- the same seven rungs as Tailwind's default
 *    `xs sm base lg xl 2xl 3xl`, with `md` standing in the position `base`
 *    holds upstream. `text-sm` and the rest of this file's sizes keep their
 *    names unchanged, matching how ui/button.tsx and ui/calendar.tsx already
 *    treat this scale: by rung, not by this app's own pixel values (which
 *    differ from Tailwind's defaults at every step).
 *
 * LATER, AND ON PURPOSE (2026-08-27, wiring these into the app):
 *
 * THE BREAKPOINT VARIANTS ARE GONE, NOT TRANSLATED. This file shipped six
 * `sm:`/`md:` classes and not one of them compiled -- this app imports only
 * `tailwindcss/utilities.css` and never the default theme, so there is no
 * `--breakpoint-*` for a screen variant to mean anything against (the only
 * @media rules in the bundle are prefers-reduced-motion, forced-colors and
 * hover). The consequence was not cosmetic: the footer's `sm:flex-row` was the
 * only rule making it horizontal, so a `size="default"` dialog stacked its
 * buttons in a reversed column and both callers reached for `size="sm"` to get
 * around it. Everything upstream gated behind a breakpoint is what it wanted
 * on a desktop, and this app is only ever a desktop -- so each one is now
 * unconditional, and `data-[size=default]` takes the 384px width the `sm:`
 * rule was there to give it.
 *
 * AND IT CASTS A SHADOW. The overlay is `bg-transparent` by upstream's choice,
 * which leaves a panel-coloured card on a panel-coloured board separated only
 * by `ring-line`. `shadow-pop` is the elevation this palette already has for
 * something floating above the page; a scrim would need a palette role that
 * does not exist.
 */

import * as React from "react";
import { type VariantProps } from "class-variance-authority";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";

import { cn } from "../../react/cn.js";
import { buttonVariants } from "./button.js";

function AlertDialog({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  );
}

function AlertDialogPortal({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  );
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn("bg-transparent fixed inset-[0px] z-50", className)}
      {...props}
    />
  );
}

function AlertDialogContent({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
  size?: "default" | "sm";
}) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        data-size={size}
        className={cn(
          "bg-panel ring-line gap-3xl rounded-lg p-3xl ring-1 shadow-pop data-[size=default]:max-w-[384px] data-[size=sm]:max-w-[320px] group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-full -translate-x-1/2 -translate-y-1/2 outline-none",
          className,
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        "grid grid-rows-[auto_1fr] place-items-center gap-sm text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-3xl group-data-[size=default]/alert-dialog-content:place-items-start group-data-[size=default]/alert-dialog-content:text-left group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "bg-panel-2/50 -mx-3xl -mb-3xl rounded-b-lg border-t border-line p-3xl flex flex-row justify-end gap-md group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogMedia({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-media"
      className={cn(
        "bg-panel-2 mb-md inline-flex size-7xl items-center justify-center rounded-md group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-5xl",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn(
        "text-md font-medium group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn(
        "text-muted *:[a]:hover:text-text text-sm text-pretty *:[a]:underline *:[a]:underline-offset-3",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> &
  Pick<VariantProps<typeof buttonVariants>, "variant" | "size">) {
  return (
    <AlertDialogPrimitive.Action
      data-slot="alert-dialog-action"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

function AlertDialogCancel({
  className,
  variant = "outline",
  size = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel> &
  Pick<VariantProps<typeof buttonVariants>, "variant" | "size">) {
  return (
    <AlertDialogPrimitive.Cancel
      data-slot="alert-dialog-cancel"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
