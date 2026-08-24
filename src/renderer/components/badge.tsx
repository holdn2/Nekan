/**
 * The small count pill: how many in history, in the trash, in the brain dump.
 *
 * It exists as a component because the same pill is drawn in two unrelated
 * places -- the tab strip and the dump's header -- and it used to be a shared
 * `.badge` rule holding them together. Moving the tab strip to utilities broke
 * the dump, silently, because the rule the dump was leaning on went with it.
 * One component is what makes that impossible rather than remembered.
 *
 * `className` is merged, not appended, so a caller can actually change one of
 * these choices instead of adding a second utility that may or may not win.
 */

import type { ReactNode } from "react";

import { cn } from "../react/cn.js";

export function Badge({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      id={id}
      // `badge` stays a class name: one declaration still belongs to it in
      // tabs.css, the vertical padding, which is a measurement rather than a
      // choice and is not on the spacing scale.
      className={cn(
        "badge inline-flex items-center justify-center rounded-pill",
        "bg-panel-3 text-xs font-normal leading-none text-muted tabular-nums",
        className,
      )}
    >
      {children}
    </span>
  );
}
