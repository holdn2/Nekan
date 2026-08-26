/**
 * Ported from the watermelon component registry
 * (scratchpad/watermelon/textarea.tsx), MIT licensed --
 * Copyright (c) 2026 Watermelon Platform Contributors.
 *
 * Kept verbatim: the `data-slot` attribute and every non-colour, non-spacing
 * selector (`focus-visible`, `aria-invalid`, `disabled`, `placeholder:`,
 * `field-sizing-content`).
 *
 * DEVIATIONS FROM UPSTREAM, AND WHY: the same ones ui/input.tsx makes, for the
 * same reasons -- the two upstream files are near-identical strings, and nothing
 * about a multi-line field changes any of the calls:
 *
 * 1. TOKENS. `border-input` -> `border-line`; `bg-input`/`dark:bg-input/30`
 *    -> `bg-input-bg` (already how `components/add-form.tsx` and
 *    `views/memo.tsx` fill their own fields); `focus-visible:border-ring` ->
 *    `focus-visible:border-line-strong`; `focus-visible:ring-ring/50` ->
 *    `focus-visible:ring-ring`; `aria-invalid:ring-destructive/20` ->
 *    `aria-invalid:ring-danger/20`; `aria-invalid:border-destructive` ->
 *    `aria-invalid:border-danger`; `placeholder:text-muted-foreground` ->
 *    `placeholder:text-muted`. `disabled:bg-input/50`/`dark:disabled:
 *    bg-input/80` are dropped, not translated -- upstream's own
 *    `disabled:opacity-50` already dims the same fill. Every `dark:` variant
 *    is dropped outright; see ui/button.tsx's file comment.
 *
 * 2. SPACING. `px-2.5` (10px) -> `px-lg`; `py-2` (8px) -> `py-md`. `min-h-16`
 *    (64px) has no matching named step in this app's scale (the largest is
 *    `7xl` at 40px) and became the arbitrary `min-h-[64px]` the task calls
 *    out as the expected escape hatch for a size this far outside the scale.
 *
 * 3. RADIUS. Upstream derives its radius scale from one `--radius: 0.625rem`
 *    (10px) custom property, so its `rounded-lg` is 10px (see ui/input.tsx's
 *    file comment for the derivation), not the 8px `ui/button.tsx` assumed
 *    for its own base radius (that file has this wrong and is being fixed
 *    separately; not copied here). Matched on the pixel: this app's 10px
 *    step is `panel`, so the base class became `rounded-panel`.
 *
 * 4. FONT SIZE. `text-base` (1rem = 16px) -> `text-xl` (this app's
 *    `--fs-xl`, also 16px).
 *
 * 5. `md:text-sm` DROPPED, NOT TRANSLATED. This app's Tailwind build never
 *    imports a default theme, so it defines no `--breakpoint-*` and no
 *    screen variant can compile -- there is no `@media` width rule anywhere
 *    in this app's built CSS. See ui/input.tsx's file comment for the full
 *    reasoning (this file only reaches the same conclusion).
 */

import * as React from "react";

import { cn } from "../../react/cn.js";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-line bg-input-bg focus-visible:border-line-strong focus-visible:ring-ring aria-invalid:ring-danger/20 aria-invalid:border-danger rounded-panel border px-lg py-md text-xl transition-colors focus-visible:ring-3 aria-invalid:ring-3 placeholder:text-muted flex field-sizing-content min-h-[64px] w-full outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
