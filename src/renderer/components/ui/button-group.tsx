/**
 * Ported from the watermelon component registry
 * (public/r/button-group-1.json in WatermelonCorp/watermellon-registry),
 * MIT licensed -- Copyright (c) 2026 Watermelon Platform Contributors.
 *
 * WHAT WAS PORTED, AND WHY IT IS A COMPONENT HERE AND NOT THERE:
 *
 * That registry has no `button-group` primitive. Every one of its twelve
 * button-group entries is a finished example that builds the group inline --
 * a wrapper div with `-space-x-px`, and each child told which of its own
 * corners to flatten. Upstream's own file is a demo with `Upload` and
 * `24 files` written into it, so there is nothing to copy verbatim; what
 * transfers is the arrangement, and that is what this file holds.
 *
 * Making it a component rather than repeating the wrapper at the call site is
 * the same reasoning as components/badge.tsx and components/ghost-button.tsx:
 * the overlap is one pixel and the corner flattening has to agree with it, so
 * the two belong in one place rather than in every caller that ever groups
 * two controls.
 *
 * DEVIATIONS FROM UPSTREAM, AND WHY:
 *
 * 1. TOKENS. Upstream's example puts `border-border/70` and `bg-muted/20` on
 *    its own children; those are the caller's business, not the wrapper's, and
 *    this app's equivalents (`border-line-strong`, `bg-panel-2`) are already
 *    what its controls rest on. Nothing colour-bearing is stated here.
 *
 * 2. NO `shadow-xs`. Upstream's wrapper carries one. Nothing else in this
 *    app's forms is raised, and a shadow under two controls that sit inside a
 *    quadrant card would be a second elevation inside a first.
 *
 * 3. `-space-x-px` IS SPELLED OUT. That utility is Tailwind's own `px` step
 *    rather than a spacing-scale one, so it does compile here -- but this app
 *    has no numeric spacing scale at all (see styles/index.css), and a reader
 *    checking whether a class survived the build should not have to know which
 *    utilities are exceptions. `[&>*+*]:ml-[-1px]` says the same thing in the
 *    arbitrary form the rest of this codebase uses, and is what the built CSS
 *    was checked for.
 *
 * 4. RADIUS IS THE CALLER'S. Upstream's wrapper states `rounded-md` and each
 *    child restates it on its own outer corners. Only the children's corners
 *    actually draw anything -- the wrapper has no background or border -- so
 *    stating it twice is one more place to disagree. The wrapper positions;
 *    the children round.
 *
 * WHY THE OVERLAP: two adjacent 1px borders would read as a 2px rule between
 * the halves and as 1px everywhere else. Pulling the second child back by a
 * pixel puts one border there, which is what makes the pair read as one
 * control rather than as two touching ones.
 */

import type { ReactNode } from "react";

import { cn } from "../../react/cn.js";

export function ButtonGroup({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-slot="button-group"
      className={cn(
        "inline-flex w-fit items-center",
        // The overlap. `focus-visible:z-10` on a child is what stops the
        // neighbour's border from being drawn over its focus ring.
        "[&>*+*]:ml-[-1px]",
        className,
      )}
    >
      {children}
    </div>
  );
}
