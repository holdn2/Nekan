/**
 * Ported from the watermelon component registry
 * (scratchpad/watermelon/popover.tsx), MIT licensed --
 * Copyright (c) 2026 Watermelon Platform Contributors.
 *
 * Kept verbatim: every `data-slot`, the primitive-to-wrapper split (`Popover`
 * / `PopoverTrigger` / `PopoverAnchor` render their Radix primitive directly
 * with no class of their own), and the header/title/description trio's shape
 * -- including that `PopoverTitle` is typed off `React.ComponentProps<"h2">`
 * but renders a `<div>`. That mismatch is upstream's, not introduced here.
 *
 * `due-calendar.tsx` already talks to `@radix-ui/react-popover` directly and
 * is NOT touched by this file -- see its own file comment for why the grid
 * inside it is a second, independent port. This wrapper exists for callers
 * that have not been written yet.
 *
 * DEVIATIONS FROM UPSTREAM, AND WHY:
 *
 * 1. `radix-ui` UMBRELLA PACKAGE, NOT INSTALLED. Upstream imports
 *    `{ Popover as PopoverPrimitive } from "radix-ui"`; this app depends on
 *    `@radix-ui/react-popover` directly (the same package `due-calendar.tsx`
 *    and `due-chip.tsx` already import as `* as Popover`). Swapped for
 *    `import * as PopoverPrimitive from "@radix-ui/react-popover"`, which
 *    exposes the same `Root`/`Trigger`/`Portal`/`Content`/`Anchor` members.
 *
 * 2. NO `asChild`. Unlike `button.tsx`, this file never used it upstream --
 *    nothing here to drop, noted only so a reviewer does not go looking.
 *
 * 3. ENTER/EXIT ANIMATION UTILITIES DROPPED. Upstream's `PopoverContent`
 *    class list carries `data-open:animate-in`, `data-closed:animate-out`,
 *    `fade-in-0`/`fade-out-0`, `zoom-in-95`/`zoom-out-95`, and four
 *    `slide-in-from-*-2` variants. All of them are utilities the
 *    `tailwindcss-animate` plugin defines; this app's `devDependencies` do
 *    not include that plugin (or `tw-animate-css`), and adding it was out of
 *    scope for a port ("never run `npm install`"). Left in, they would
 *    compile to nothing -- Tailwind drops a class name it does not recognise
 *    rather than erroring -- so removing them changes nothing about what
 *    actually renders today; it only removes dead class names. The
 *    `duration-100` and `origin-(--radix-popover-content-transform-origin)`
 *    utilities existed solely to time and pivot that animation, so they went
 *    with it. The popover still opens and closes correctly -- Radix mounts
 *    and unmounts `Content` regardless of Tailwind's animation utilities --
 *    it simply does so without a fade/zoom transition.
 *
 * 4. TOKENS. `bg-popover`/`text-popover-foreground` -> `bg-panel`/`text-text`;
 *    `text-muted-foreground` -> `text-muted` (this palette has no
 *    `-foreground` suffix family at all -- see `button.tsx`'s file comment).
 *    `ring-foreground/10` -> `ring-line`, dropping the opacity rather than
 *    inventing one: `line` is already the palette's subtle-border tone in
 *    both themes (see `src/shared/theme.ts`), which is exactly what a 10%
 *    tint of the full-contrast foreground colour was standing in for.
 *    `shadow-md` -> `shadow-pop`, the same elevation `due-calendar.tsx`
 *    already uses for its own popover panel.
 *
 * 5. SPACING. No numeric `--spacing` scale exists here (see `button.tsx`'s
 *    file comment for the general rule). `gap-2.5` (10px) -> `gap-lg`,
 *    `p-2.5` (10px) -> `p-lg`. `w-72` (18rem/288px) has no named step at that
 *    size and becomes the arbitrary `w-[288px]`.
 *
 * 6. RADIUS. Upstream's `rounded-lg` is this registry's base radius, which
 *    `button.tsx`'s file comment already established is 8px -- this app's
 *    `rounded-lg` is 12px (`--radius-lg` in `styles/index.css`), so matching
 *    the pixel rather than the name makes it `rounded-md` (8px), same as
 *    that file's base class.
 */

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "../../react/cn.js";

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "bg-panel text-text ring-line flex flex-col gap-lg rounded-md p-lg text-sm shadow-pop ring-1 z-50 w-[288px] outline-hidden",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-2xs text-sm", className)}
      {...props}
    />
  );
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <div
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  );
}

function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="popover-description"
      className={cn("text-muted", className)}
      {...props}
    />
  );
}

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
};
