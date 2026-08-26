/**
 * Ported from the watermelon component registry
 * (scratchpad/watermelon/separator.tsx), MIT licensed --
 * Copyright (c) 2026 Watermelon Platform Contributors.
 *
 * Kept verbatim: the `data-slot` attribute, the `decorative`/`orientation`
 * prop defaults, and `shrink-0`.
 *
 * DEVIATIONS FROM UPSTREAM, AND WHY:
 *
 * 1. IMPORT PATH. Upstream imports `{ Separator as SeparatorPrimitive } from
 *    "radix-ui"` -- the umbrella package that re-exports every Radix
 *    primitive from one module. That package is not a dependency here (see
 *    ui/button.tsx's file comment on `asChild`/`Slot` for the same umbrella
 *    package). What is installed is the scoped `@radix-ui/react-separator`,
 *    which this app already reaches for its other Radix primitives the same
 *    way (`import * as Popover from "@radix-ui/react-popover"` in
 *    `components/due-calendar.tsx`; `import * as Select from
 *    "@radix-ui/react-select"` in `components/language-select.tsx`). Same
 *    shape here: `import * as SeparatorPrimitive from
 *    "@radix-ui/react-separator"`, and `SeparatorPrimitive.Root` resolves the
 *    same as it did through the umbrella package -- the scoped package
 *    exports `Root` too.
 *
 * 2. `data-horizontal:`/`data-vertical:` -> `data-[orientation=horizontal]:`/
 *    `data-[orientation=vertical]:`. Upstream's bare form is Tailwind's
 *    boolean-attribute shorthand -- `data-horizontal:` compiles to
 *    `&[data-horizontal]`, matching an element that carries an attribute
 *    literally named `data-horizontal`. Radix's `Separator.Root` never sets
 *    one: it sets `data-orientation="horizontal"` or `"vertical"`
 *    (`node_modules/@radix-ui/react-separator/dist/index.mjs`). Upstream's
 *    own registry evidently defines a project-wide `@custom-variant` that
 *    aliases `data-horizontal`/`data-vertical` to that attribute-value pair;
 *    this app defines no such alias, and the bare shorthand would compile to
 *    a selector that can never match rather than fail to compile -- exactly
 *    the silent trap the task's own verification notes call out ("a class
 *    that does not compile still appears in the attribute"). Written out
 *    directly instead, with the value Radix actually sets.
 *
 * 3. TOKENS. `bg-border` -> `bg-line`. Not in the task's colour table
 *    verbatim (that table maps `border-border`/`border-input`, a
 *    `border-*` utility, to `border-line`) but the same token either way:
 *    the divider's colour is `line` regardless of whether it is painted
 *    through `border-color` or, as here, `background-color`.
 */

import * as React from "react";
import * as SeparatorPrimitive from "@radix-ui/react-separator";

import { cn } from "../../react/cn.js";

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "bg-line shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
