/**
 * Ported from the watermelon component registry
 * (scratchpad/watermelon/input.tsx), MIT licensed --
 * Copyright (c) 2026 Watermelon Platform Contributors.
 *
 * Kept verbatim: the `data-slot` attribute, the `file:` selectors for a
 * `type="file"` input's own button, and every non-colour, non-spacing
 * selector (`focus-visible`, `aria-invalid`, `disabled`, `placeholder:`).
 *
 * DEVIATIONS FROM UPSTREAM, AND WHY:
 *
 * 1. TOKENS. `border-input` -> `border-line`; `focus-visible:border-ring` ->
 *    `focus-visible:border-line-strong`; `focus-visible:ring-ring/50` ->
 *    `focus-visible:ring-ring` (the `/50` is not stacked on top of an
 *    already-translucent token, per ui/button.tsx's file comment);
 *    `aria-invalid:ring-destructive/20` -> `aria-invalid:ring-danger/20`;
 *    `aria-invalid:border-destructive` -> `aria-invalid:border-danger`;
 *    `file:text-foreground` -> `file:text-text`; `placeholder:
 *    text-muted-foreground` -> `placeholder:text-muted`.
 *
 *    `bg-input`/`dark:bg-input/30` collapse to one token,
 *    `bg-input-bg` -- this palette already answers `[data-theme="dark"]` on
 *    its own (`--input-bg` in `styles/palette.css`), the same reasoning as
 *    every `dark:` drop in ui/button.tsx and ui/calendar.tsx. That token is
 *    already how this app fills its other text inputs (see
 *    `components/add-form.tsx`, `views/memo.tsx`), so this keeps that
 *    convention rather than upstream's transparent-until-dark-mode one.
 *    `disabled:bg-input/50`/`dark:disabled:bg-input/80` are dropped rather
 *    than translated: upstream's own base classes already end in
 *    `disabled:opacity-50`, which dims the same solid fill this file gives
 *    the input at rest, so the two disabled treatments were redundant on top
 *    of each other even upstream.
 *
 *    Every remaining `dark:` variant is dropped outright, not translated --
 *    see ui/button.tsx's file comment for the full reasoning.
 *
 * 2. SPACING. `h-8` (32px) -> `h-6xl`; `px-2.5` (10px) -> `px-lg`; `py-1`
 *    (4px) -> `py-xs`; `file:h-6` (24px) -> `file:h-5xl`; all exact pixel
 *    matches at Tailwind's default 4px unit, none of them zero-value so none
 *    needed an arbitrary escape hatch.
 *
 * 3. RADIUS. Upstream derives its whole radius scale from one `--radius:
 *    0.625rem` (10px) custom property (`sm = radius-4 = 6px`, `md =
 *    radius-2 = 8px`, `lg = radius = 10px`, `xl = radius+4 = 14px` --
 *    watermelon's `src/index.css`), so `rounded-lg` here is 10px, not the
 *    8px `ui/button.tsx` assumed for its own base radius (that file has this
 *    wrong and is being fixed separately; not copied here). Matched on the
 *    pixel: this app's 10px step is `panel`, so the base class became
 *    `rounded-panel`.
 *
 * 4. FONT SIZE. This app defines no `text-base` step -- only the named sizes
 *    in `src/renderer/react/cn.ts`'s `TEXT` list. `text-base` is Tailwind's
 *    unthemed default (1rem = 16px), which this app's `--fs-xl` also happens
 *    to be (`styles/base.css`), so `text-base` -> `text-xl`.
 *
 * 5. `md:text-sm` DROPPED, NOT TRANSLATED. This app's `index.css` imports
 *    only `tailwindcss/utilities.css` (see ui/button.tsx's file comment on
 *    the missing preflight for the same reason), never the default theme --
 *    and a breakpoint variant needs a `--breakpoint-*` value from that
 *    theme to mean anything. There is no `@media` rule of any width
 *    anywhere in this app's built CSS, checked directly rather than
 *    assumed: `md:` (and every other screen variant) cannot compile here at
 *    all, for any class, not just this one. `ui/calendar.tsx`'s own
 *    `md:flex-row` has the same problem and was not caught when that file
 *    was ported -- not fixed here, since this file has no reason to touch
 *    that one, but worth knowing before reaching for a screen variant
 *    anywhere in this renderer. Dropped outright rather than kept as dead
 *    weight, the same treatment ui/badge.tsx gives a selector that can
 *    never match.
 */

import * as React from "react";

import { cn } from "../../react/cn.js";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "bg-input-bg border-line focus-visible:border-line-strong focus-visible:ring-ring aria-invalid:ring-danger/20 aria-invalid:border-danger h-6xl rounded-panel border px-lg py-xs text-xl transition-colors file:h-5xl file:text-lg file:font-medium focus-visible:ring-3 aria-invalid:ring-3 file:text-text placeholder:text-muted w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
