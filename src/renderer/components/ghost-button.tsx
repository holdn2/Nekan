/**
 * The quiet bordered button: the bulk actions above a history list, and the
 * memo panel's 되돌리기 / 삭제.
 *
 * This is now a thin wrapper over the ported `Button` rather than its own set
 * of utilities, so those buttons pick up the shape the rest of the app is
 * moving to. It stays a component for two reasons.
 *
 * The first is what it was created for: `.ghost` was declared in archive.css
 * and used by the memo panel as well, with nothing on either side saying so.
 * Rewriting archive.css without noticing would have taken the memo panel's
 * buttons with it -- the same way gutting `.badge` took the brain dump's
 * count. One component is what makes that impossible rather than remembered.
 *
 * The second is `danger`, which is deliberately NOT `Button`'s own
 * `destructive` variant. Upstream's destructive carries a red fill at rest;
 * here the red only appears on hover, because 영구 삭제 sitting there in red
 * all the time reads as a warning about the list rather than as a thing you
 * can press. That is expressed here, as `outline` plus hover colours, rather
 * than as a new variant inside the ported file -- so the port stays a port.
 */

import type { ReactNode } from "react";

import { Button } from "./ui/button.js";
import { cn } from "../react/cn.js";

export function GhostButton({
  danger,
  onClick,
  className,
  children,
  ref,
  ...rest
}: {
  danger?: boolean;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
  // React 19 takes a ref as an ordinary prop, so this is a pass-through rather
  // than a forwardRef. It is here because a caller that opens a dialog has to
  // put focus back on the button afterwards, and reading document.activeElement
  // at click time is not the same question -- it answers with whatever the last
  // press left behind.
  ref?: React.Ref<HTMLButtonElement>;
} & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "className" | "onClick" | "ref"
>) {
  return (
    <Button
      type="button"
      variant="outline"
      ref={ref}
      onClick={onClick}
      className={cn(
        // `outline` leaves the resting text at the inherited colour; these
        // buttons are secondary to the list they sit above, so they start
        // muted and come up to full contrast on hover -- which `outline`
        // already does for the background.
        "text-muted",
        // `outline` draws its edge in `line`, the hairline used between rows.
        // Measured on a panel background that lands two ramp steps off the
        // panel itself and all but disappears -- and the edge is the only
        // thing saying this is a button, since the fill is the panel's own.
        // `line-strong` is the same border a step darker, which is what this
        // button was drawn with before and what it needs to stay legible.
        "border-line-strong",
        danger && "hover:border-danger hover:bg-danger-soft hover:text-danger",
        className,
      )}
      {...rest}
    >
      {children}
    </Button>
  );
}
