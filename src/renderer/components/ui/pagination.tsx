/**
 * Ported from the watermelon component registry, MIT licensed --
 * Copyright (c) 2026 Watermelon Platform Contributors.
 *
 * WHICH UPSTREAM FILE THIS IS. The extracted `scratchpad/watermelon/
 * pagination.tsx` and the two examples beside it do not describe the same
 * component. That file is a self-contained animated page counter ("3 of 15",
 * one digit springing over another) built on `motion/react` and
 * `react-icons/hi2`; the examples (`pagination-2.tsx`, `pagination-7.tsx`)
 * import `Pagination` / `PaginationContent` / `PaginationItem` /
 * `PaginationLink` from `@/components/ui/pagination`, which is the shadcn-
 * shaped parts kit -- and that is also what the registry manifest for this
 * entry declares its dependencies to be (registry: `button`; npm:
 * `lucide-react`). The animated file declares neither of those and uses
 * neither. So the parts kit is what the examples consume and what was
 * actually asked for, and it is what this file is. Nothing from the animated
 * file survives: `motion/react` and `react-icons` are not dependencies here
 * and are not being added for a page control.
 *
 * DEVIATIONS FROM UPSTREAM, AND WHY:
 *
 * 1. `PaginationLink` IS A `<button>`, NOT AN `<a href>`. Upstream renders an
 *    anchor, which is right for a paged route on the web where a page is a URL
 *    worth linking and opening in a new tab. This renderer is a single local
 *    page inside Electron: there is no route to point at, and every one of the
 *    examples' `href="#"` placeholders would be a real navigation -- clicking
 *    one appends `#` to the file:// URL and, worse, an anchor is draggable and
 *    offers a context menu full of browser verbs ("Open Link in New Tab") that
 *    do nothing here. A `<button type="button">` is what this control has
 *    always actually been. `aria-current="page"` is kept exactly as upstream
 *    sets it, which is the part screen readers rely on either way.
 *
 * 2. NO `asChild`, FOR THE REASON ui/button.tsx ALREADY GIVES. Upstream's
 *    `PaginationLink` can hand its classes to a router's own `<Link>` through
 *    the `radix-ui` umbrella's `Slot`. That package is not a dependency here
 *    (see ui/button.tsx, point 1) and there is no router to hand anything to.
 *
 * 3. ICONS ARE LUCIDE. Upstream's own parts kit already uses `lucide-react`,
 *    so `ChevronLeft` / `ChevronRight` / `MoreHorizontal` are untouched. The
 *    two examples import `@tabler/icons-react` instead; that is not a
 *    dependency here and must not become one, so `IconChevronsLeft` /
 *    `IconChevronsRight` (the first/last jumps, which the parts kit has no
 *    part for) are drawn with Lucide's `ChevronsLeft` / `ChevronsRight`.
 *
 *    Weight: the icons render at 14px (`size-2xl`) with Lucide's own
 *    `strokeWidth={2}`, matching ui/calendar.tsx -- the other ported file that
 *    draws chevrons -- rather than the `* 24/16` conversion in
 *    react/icons.tsx. That conversion exists to make a Lucide icon weigh what
 *    the hand-drawn icon it replaced weighed; these chevrons replace nothing,
 *    so there is no original weight to match. Effective stroke here is
 *    2 * 14/24 = 1.17px, which sits between calendar's 1.33px (16px) and
 *    react/icons.tsx's ChevronIcon at 1.1px (11px at 2.4).
 *
 * 4. TOKENS. Neither example's colours transfer: they are `neutral-*` scale
 *    literals (`bg-neutral-50`, `bg-neutral-100/50`, `text-neutral-900`,
 *    `bg-white`, `text-black`) and this app has no numeric colour scale at all
 *    -- `tools/check-colors.js` is a ratchet that fails on a hex outside
 *    `src/shared/theme.ts`. Mapped onto the palette roles in
 *    `styles/palette.css`: the tray behind the buttons is `bg-panel-2`, a
 *    resting number is transparent over it, and the ellipsis is `text-faint`.
 *    Every `dark:` variant is dropped rather than translated, for the reason
 *    ui/button.tsx point 3 gives -- these tokens already resolve differently
 *    under `[data-theme="dark"]`, so a hand-written dark rule would be a
 *    second place to keep in sync.
 *
 * 5. THE ACTIVE PAGE IS FILLED, NOT OUTLINED. Upstream maps `isActive` to
 *    `variant: "outline"`, and pagination-7 adds `scale-105` and a shadow on
 *    top. An outline button's fill in this palette *is* the panel, so on the
 *    `bg-panel-2` tray the active page would differ from its neighbours by one
 *    hairline -- the same near-invisible edge ui/input.tsx and ui/button.tsx
 *    point 8 both had to work around. `variant: "default"` (accent fill,
 *    `text-on-accent`) says "you are here" at a glance, which is the whole job
 *    of the control. `scale-105` is dropped with it: a 5% bigger button on a
 *    28px control is under one and a half pixels, and it makes the tray's
 *    height depend on which page you are on.
 *
 * 6. SPACING AND RADIUS. This app defines no numeric `--spacing` scale (see
 *    `styles/index.css`), so `gap-1.5` / `p-1` / `size-9` do not compile at
 *    all -- they are not slow, they are absent. Converted on the pixel:
 *    `gap-1.5` = 6px = `gap-sm`, `p-1` = 4px = `p-xs`. `size-9` (36px) is the
 *    web's comfortable click target; this widget is 660px wide in bar mode and
 *    its own rows are 28px, so the buttons take ui/button.tsx's `icon-sm`
 *    (28px) instead and the numbers take `sm` (28px tall) widened to a 28px
 *    minimum so a three-digit page still fits one line.
 *    Radius: upstream's `rounded-2xl` (16px) has no step here (xs 4 / sm 6 /
 *    md 8 / panel 10 / lg 12 / pill), so the tray is `rounded-lg` (12px) and
 *    the buttons inside it are `rounded-md` (8px) -- keeping the nesting
 *    proportion rather than either name.
 *
 * 7. NO `@media` VARIANTS. pagination-2 carries none, but the registry's parts
 *    kit sizes its Previous/Next labels at a breakpoint and the animated file
 *    is `sm:` throughout. This app compiles no `@media` rules whatsoever, so a
 *    `sm:` variant is not a smaller-screen fallback, it is dead text -- the
 *    ported alert-dialog shipped six of them and its footer silently never
 *    went horizontal. Deleted, not translated.
 *
 * 8. THE LIST RESETS ITSELF. Upstream can leave `<ul>`'s margin, padding and
 *    bullets alone because it sits on Tailwind's preflight. This app imports
 *    only `tailwindcss/utilities.css` and no preflight at all (see
 *    ui/button.tsx point 7), so `PaginationContent` asks for
 *    `m-[0px] list-none p-[0px]` explicitly -- the same three the archive's
 *    own list already spells out in views/archive/tab.tsx.
 *
 * 9. `PaginationBar` IS AN ADDITION, NOT UPSTREAM. The parts above are dumb by
 *    design and upstream expects each caller to lay out its own buttons, which
 *    is why both examples hard-code `[1, 2, 3]`. A real hundred-page list
 *    cannot: it needs a window around the current page and an ellipsis where
 *    the numbers jump. That logic is here, once, rather than copied into both
 *    archive tabs. It takes its words as props rather than importing `t()`,
 *    because no file under components/ui/ imports the renderer's i18n and this
 *    one should not be the first -- the caller translates.
 */

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MoreHorizontal,
} from "lucide-react";

import { cn } from "../../react/cn.js";
import { buttonVariants } from "./button.js";

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      // Redundant beside <nav> in every browser this ships to, and kept
      // because upstream sets it and it costs nothing. The label is the
      // caller's -- it is a user-visible string and has to come from the
      // catalogue.
      role="navigation"
      data-slot="pagination"
      className={cn("flex w-full justify-center", className)}
      {...props}
    />
  );
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn(
        "m-[0px] flex list-none items-center gap-2xs p-[0px]",
        className,
      )}
      {...props}
    />
  );
}

function PaginationItem(props: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />;
}

type PaginationLinkProps = React.ComponentProps<"button"> & {
  isActive?: boolean;
  /** Only the two ui/button.tsx sizes this control uses. */
  size?: "icon-sm" | "sm";
};

function PaginationLink({
  className,
  isActive,
  size = "icon-sm",
  ...props
}: PaginationLinkProps) {
  return (
    <button
      type="button"
      data-slot="pagination-link"
      // What upstream sets and what a screen reader actually reads; the fill
      // in point 5 is the sighted half of the same answer.
      aria-current={isActive ? "page" : undefined}
      data-active={isActive ? "true" : undefined}
      className={cn(
        buttonVariants({ variant: isActive ? "default" : "ghost", size }),
        className,
      )}
      {...props}
    />
  );
}

/** An icon-only step button. The label is its accessible name and its tooltip. */
function PaginationStep({
  label,
  children,
  className,
  ...props
}: React.ComponentProps<"button"> & { label: string }) {
  return (
    <PaginationLink
      aria-label={label}
      title={label}
      className={cn("text-muted hover:text-text", className)}
      {...props}
    >
      {children}
    </PaginationLink>
  );
}

function PaginationFirst(
  props: React.ComponentProps<"button"> & { label: string },
) {
  return (
    <PaginationStep {...props}>
      <ChevronsLeft className="size-2xl" strokeWidth={2} aria-hidden="true" />
    </PaginationStep>
  );
}

function PaginationPrevious(
  props: React.ComponentProps<"button"> & { label: string },
) {
  return (
    <PaginationStep {...props}>
      <ChevronLeft className="size-2xl" strokeWidth={2} aria-hidden="true" />
    </PaginationStep>
  );
}

function PaginationNext(
  props: React.ComponentProps<"button"> & { label: string },
) {
  return (
    <PaginationStep {...props}>
      <ChevronRight className="size-2xl" strokeWidth={2} aria-hidden="true" />
    </PaginationStep>
  );
}

function PaginationLast(
  props: React.ComponentProps<"button"> & { label: string },
) {
  return (
    <PaginationStep {...props}>
      <ChevronsRight className="size-2xl" strokeWidth={2} aria-hidden="true" />
    </PaginationStep>
  );
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      // Decorative: the numbers either side already say what was skipped, and
      // "horizontal dots" read aloud between two page numbers is noise.
      aria-hidden="true"
      data-slot="pagination-ellipsis"
      className={cn(
        "flex size-[28px] items-center justify-center text-faint",
        className,
      )}
      {...props}
    >
      <MoreHorizontal className="size-2xl" strokeWidth={2} />
    </span>
  );
}

/** The words PaginationBar puts on screen. See point 9: the caller translates. */
interface PaginationLabels {
  /** Names the <nav> itself. */
  nav: string;
  first: string;
  previous: string;
  next: string;
  last: string;
  /** Names one numbered button, e.g. "Page 7". */
  page: (n: number) => string;
}

/**
 * Which page numbers to draw, and where the numbers jump.
 *
 * Always the first and the last -- they are the two a hundred-page list is
 * most often reaching for -- plus `span` either side of where you are. A gap
 * marker goes wherever consecutive entries are not consecutive pages.
 *
 * Exported for the tests: the interesting cases are the ends, where the window
 * is clipped and one ellipsis has nothing to hide.
 */
function pageWindow(
  page: number,
  pageCount: number,
  span = 1,
): (number | "gap")[] {
  const wanted = new Set<number>([1, pageCount]);
  for (let p = page - span; p <= page + span; p += 1) {
    if (p >= 1 && p <= pageCount) wanted.add(p);
  }
  const out: (number | "gap")[] = [];
  let previous = 0;
  for (const p of [...wanted].sort((a, b) => a - b)) {
    // A gap of exactly one page is drawn as that page: an ellipsis hiding a
    // single number is both wider than the number and unclickable.
    if (previous && p - previous === 2) out.push(previous + 1);
    else if (previous && p - previous > 2) out.push("gap");
    out.push(p);
    previous = p;
  }
  return out;
}

/**
 * The whole control: first, previous, a window of numbers, next, last.
 *
 * Answers nothing when there is one page or none. A control whose every button
 * is disabled is furniture -- it takes height from the list and tells you only
 * that there was nothing to tell you.
 */
function PaginationBar({
  page,
  pageCount,
  onPage,
  labels,
  className,
}: {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  labels: PaginationLabels;
  className?: string;
}) {
  if (pageCount <= 1) return null;
  const go = (n: number) => {
    const next = Math.min(pageCount, Math.max(1, n));
    if (next !== page) onPage(next);
  };
  const atStart = page <= 1;
  const atEnd = page >= pageCount;

  return (
    <Pagination aria-label={labels.nav} className={className}>
      <PaginationContent className="w-fit rounded-lg bg-panel-2 p-xs">
        <PaginationItem>
          <PaginationFirst
            label={labels.first}
            disabled={atStart}
            onClick={() => go(1)}
          />
        </PaginationItem>
        <PaginationItem>
          <PaginationPrevious
            label={labels.previous}
            disabled={atStart}
            onClick={() => go(page - 1)}
          />
        </PaginationItem>
        {pageWindow(page, pageCount).map((slot, at) =>
          slot === "gap" ? (
            // Two gaps can be on screen at once and neither is a page, so the
            // key is the position. Nothing here is stateful, so a positional
            // key costs nothing.
            <PaginationItem key={`gap-${at}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={slot}>
              <PaginationLink
                size="sm"
                isActive={slot === page}
                aria-label={labels.page(slot)}
                className="min-w-[28px] px-md tabular-nums"
                onClick={() => go(slot)}
              >
                {slot}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          <PaginationNext
            label={labels.next}
            disabled={atEnd}
            onClick={() => go(page + 1)}
          />
        </PaginationItem>
        <PaginationItem>
          <PaginationLast
            label={labels.last}
            disabled={atEnd}
            onClick={() => go(pageCount)}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

export type { PaginationLabels };
export {
  Pagination,
  PaginationBar,
  PaginationContent,
  PaginationEllipsis,
  PaginationFirst,
  PaginationItem,
  PaginationLast,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  pageWindow,
};
