/**
 * The quiet bordered button: the bulk actions above a history list, and the
 * memo panel's 되돌리기 / 삭제.
 *
 * `.ghost` was declared in archive.css and used by the memo panel as well, with
 * nothing on either side saying so. Rewriting archive.css without noticing
 * would have taken the memo panel's buttons with it -- the same way gutting
 * `.badge` took the brain dump's count.
 *
 * `danger` is the destructive variant. It only shows on hover, which is
 * deliberate: 영구 삭제 sitting there in red all the time reads as a warning
 * about the list rather than a thing you can press.
 */

import type { ReactNode } from "react";

import { cn } from "../react/cn.js";

export function GhostButton({
  danger,
  onClick,
  className,
  children,
  ...rest
}: {
  danger?: boolean;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
} & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "className" | "onClick"
>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border border-line-strong bg-panel px-xl py-sm text-muted",
        "hover:bg-panel-2 hover:text-text",
        danger && "hover:border-danger hover:bg-danger-soft hover:text-danger",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
