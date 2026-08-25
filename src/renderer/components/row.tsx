/**
 * The pieces a task row is made of, shared by the quadrants and the brain dump.
 *
 * These were `.item`, `.num`, `.text` and `.del` in matrix.css, and the dump's
 * rows used every one of them from there -- `.inbox-item .text` even repeated
 * the same six declarations rather than saying so. Moving matrix.css without
 * this took the dump's rows apart: the `<li>` stopped being a flex row, so its
 * spans went back to being inline, and the numbers lost their column.
 *
 * The history and trash rows are a different shape and keep their own, but they
 * share the number, which is why `RowNumber` takes a className -- theirs sits
 * on a taller row and lines up with the title rather than the middle.
 */

import type { ReactNode } from "react";

import { cn } from "../react/cn.js";

/**
 * The row itself. `group` is what lets the delete button appear on hover
 * without the row needing a rule about its own children.
 */
export const ROW =
  "item group flex cursor-grab items-start gap-md rounded-md px-md py-sm hover:bg-panel-2";

/**
 * The task's text. Light rather than normal: the lists are the one place on
 * screen that is nothing but content, and at this size a lighter face reads
 * calmer than the chrome around it.
 */
export const ROW_TEXT =
  "text flex-auto leading-snug font-light [word-break:break-word] whitespace-pre-wrap select-text";

/** The "1." in front of a row. Right-aligned so the digits form a column. */
export function RowNumber({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "num min-w-[15px] flex-none text-right text-xs leading-relaxed",
        "text-faint tabular-nums",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * The row's delete mark, which appears on hover.
 *
 * It holds a drawn cross rather than the × character. As text it sat 1.36px
 * low -- that glyph centres on the font's maths axis rather than on its box --
 * and the fix was a padding tuned by measurement, which stops being right the
 * moment the font changes. A path centred in its viewBox needs no number.
 */
export function DeleteButton({
  title,
  label,
  disabled,
  onClick,
  children,
}: {
  title: string;
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={cn(
        "del inline-flex h-[20px] w-[20px] flex-none items-center justify-center",
        "rounded-sm border-0 bg-transparent p-[0px] leading-none text-faint",
        // focus-visible as well as hover: the button stays tabbable while it is
        // transparent, so without this a keyboard lands on a mark nobody can see.
        "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        "hover:bg-danger-soft hover:text-danger",
      )}
      type="button"
      title={title}
      // Icon-only: without this a screen reader announces "button".
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
