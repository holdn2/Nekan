/**
 * The little round colour that says which quadrant something belongs to.
 *
 * Drawn in four places -- a history row, a quadrant header, the memo panel's
 * title, the title bar's counts -- while every rule that made it look like
 * anything lived in titlebar.css, with the brain dump's variant off in
 * inbox.css. Nothing said so, which is the same shape as the bug that took the
 * count pill: move the file that happens to hold the rule and three unrelated
 * screens lose their dots.
 *
 * `as` exists because the title bar draws these as `<i>` and everywhere else
 * uses `<span>`. Not worth unifying: it changes the markup for no gain, and the
 * element is what anything measuring this app keys on.
 */

import { cn } from "../react/cn.js";

/** Quadrant colours, plus the dump's outline. */
const LOOK: Record<string, string> = {
  q1: "bg-q1",
  q2: "bg-q2",
  q3: "bg-q3",
  q4: "bg-q4",
  // The dump is a shared area rather than one of the four, so it is drawn as an
  // outline rather than a fill. 1.5px is not on any scale and is not meant to
  // be -- at 8px across, 1px reads as grey and 2px closes the hole.
  inbox: "border-[1.5px] border-muted bg-transparent",
};

export function Dot({
  place,
  title,
  id,
  as: Tag = "span",
  className,
}: {
  place: string;
  title?: string;
  id?: string;
  as?: "span" | "i";
  className?: string;
}) {
  return (
    <Tag
      id={id}
      title={title}
      // `dot` stays a class name: collapsed.css and the title bar's own rules
      // still reach for it, and it is what the quadrant is read by from outside.
      // rounded-[50%] rather than rounded-full so the computed value is the 50%
      // it always was, not a 9999px that happens to look the same.
      className={cn(
        "dot inline-block h-md w-md shrink-0 rounded-[50%]",
        LOOK[place] ?? "",
        place,
        className,
      )}
    />
  );
}
