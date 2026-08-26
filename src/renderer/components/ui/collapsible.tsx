/**
 * Ported from the watermelon component registry
 * (scratchpad/watermelon/collapsible.tsx), MIT licensed --
 * Copyright (c) 2026 Watermelon Platform Contributors.
 *
 * Kept verbatim: this file carries no classes at all upstream -- it is three
 * one-line wrappers over Radix that exist only to stamp a `data-slot` on
 * each part, and that is exactly what is ported. There is nothing here to
 * restyle.
 *
 * DEVIATIONS FROM UPSTREAM, AND WHY:
 *
 * 1. RADIX IMPORT. Upstream imports the `radix-ui` umbrella package
 *    (`import { Collapsible as CollapsiblePrimitive } from "radix-ui"`),
 *    which is not a dependency here -- only the scoped
 *    `@radix-ui/react-collapsible` package is installed.
 *    `import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"`
 *    exposes the same `Root`/`CollapsibleTrigger`/`CollapsibleContent`
 *    members.
 *
 * 2. `import type * as React from "react"` ADDED. Upstream's file never
 *    imports React at all, only using `React.ComponentProps` in three type
 *    positions -- this compiles in the source repo's setup but not in this
 *    one's `strict` TypeScript, where an unimported `React` namespace is
 *    "cannot find name". A type-only import fixes it without changing what
 *    the file renders; this is the same kind of forced, mechanical fix as
 *    ui/calendar.tsx's point 4 (`table` -> `month_grid`) -- a compiler
 *    requirement, not a restyle.
 */

import type * as React from "react";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";

function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      {...props}
    />
  );
}

function CollapsibleContent({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      {...props}
    />
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
