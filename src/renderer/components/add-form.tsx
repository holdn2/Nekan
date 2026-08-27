/**
 * The box a task is written in. Five of them: one per quadrant, and the brain
 * dump's.
 *
 * The quadrant ones carry a due chip so a date can be set as the task is
 * typed rather than after; the brain dump's does not, because a date is one of
 * the things you decide *later* -- that is what the staging list is for.
 *
 * The chip holds its date here rather than in the store: there is no task to
 * hang it on until this form is submitted.
 *
 * ## Why the two controls below are ported primitives wearing overrides
 *
 * The text box is `ui/input` and the submit is `ui/button`. What those two
 * bring is the shape of a control -- its height, its focus ring, what it does
 * when disabled, the `data-slot` hook, and the fact that one file decides all
 * of that for the whole app rather than each caller re-deciding it.
 *
 * What they do *not* get to bring here is colour or the sizes this form was
 * measured into. Each override below names the reason, and the reasons are
 * only these three:
 *
 *   - COLOUR. Upstream's palette choices differ from this app's in a few
 *     resting tones (`border-line` vs `border-line-strong`, `text-muted` vs
 *     `text-faint`, a neutral focus ring vs this app's accent one). Changing
 *     any of them is a visual decision that is being made elsewhere, not a
 *     side effect of adopting a primitive, so each is put back.
 *   - PAIRING. The due chip beside the submit is 30px square and lives in
 *     `components/due-chip.tsx`, which this file does not own. `icon-sm` is
 *     28px, and the two are read as a pair -- there is a comment in this
 *     file's history about the last time they disagreed by two pixels.
 *   - ICON SIZE. `react/icons.tsx` decides every icon's size and stroke, and
 *     `PlusIcon` is 12px. `ui/button` sizes an icon by CSS, and CSS beats an
 *     SVG's `width` attribute, so without the override the plus would quietly
 *     become 14px.
 */

import { useRef, useState } from "react";
import type { Place } from "../../shared/types.js";
import { t } from "../i18n.js";
import { addTask } from "../store.js";
import { cn } from "../react/cn.js";
import { DueChip } from "./due-chip.js";
import { Button } from "./ui/button.js";
import { Input } from "./ui/input.js";
import { PlusIcon } from "../react/icons.js";

interface Props {
  /** Which list a task written here lands in. */
  place: Place;
  placeholderKey: string;
  /** The quadrants offer a date; the brain dump does not. */
  withDue?: boolean;
  /** The brain dump splits a pasted block into one task per line. */
  onPaste?: (
    event: React.ClipboardEvent<HTMLInputElement>,
    text: string,
  ) => boolean;
}

export function AddForm({ place, placeholderKey, withDue, onPaste }: Props) {
  const [text, setText] = useState("");
  const [due, setDue] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  return (
    <form
      // `add` stays a class: matrix.css opts the quadrants' forms out of touch
      // panning by it, and that rule is not this chunk's to move.
      //
      // The dump's add box never gives up height: when the window is too short
      // the list above shrinks and scrolls, because a panel you cannot type
      // into is not a smaller panel, it is a broken one.
      //
      // items-center is new, and it is what stops the row from stretching. The
      // text box now states a height of its own (ui/input's 32px) rather than
      // taking whatever the tallest sibling had, so the default `stretch`
      // would leave the 30px chip pinned to the top edge with two pixels of
      // air under it. Centred, the three boxes sit on one line again, and the
      // submit no longer needs a `self-center` of its own.
      className={cn(
        "add flex items-center gap-sm border-t border-line p-md",
        !withDue && "inbox-add flex-none",
      )}
      data-add={place}
      onSubmit={(e) => {
        e.preventDefault();
        addTask(place, text, due);
        setText("");
        setDue(null);
        input.current?.focus();
      }}
    >
      <Input
        ref={input}
        className={cn(
          // ui/input is `w-full`, which is right for a field on its own line
          // and wrong for one sharing a row: it wants to be whatever is left
          // after the chip and the button. `min-w-0` the primitive already
          // carries, and it is what lets that shrink actually happen.
          "w-auto flex-auto",
          // text-md (13px), not the primitive's text-xl (16px). The rows above
          // this box are 13px; a task reads at one size whether it is being
          // written or has been.
          "text-md",
          // rounded-md (8px), not rounded-panel (10px) -- the due chip and the
          // submit beside it are both 8px.
          "rounded-md",
          // COLOUR, put back. Every text box in this app rests on
          // border-line-strong and dims its placeholder to faint; the
          // primitive's border-line/text-muted are upstream's tones.
          "border-line-strong placeholder:text-faint",
          // COLOUR, put back. The primitive focuses to a neutral ring
          // (`--ring` is an ink tint, not the accent). This app's inputs have
          // always focused to the accent, so the ring keeps the primitive's
          // mechanism and the app's colour.
          "focus-visible:border-accent focus-visible:ring-accent-soft",
        )}
        type="text"
        id={place === "inbox" ? "inboxInput" : undefined}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          if (onPaste?.(e, text)) setText("");
        }}
        placeholder={t(placeholderKey)}
        maxLength={200}
        autoComplete="off"
      />
      {withDue ? <DueChip value={due} onChange={setDue} inAddForm /> : null}
      {/* outline/icon-sm: a bordered box the size of the chip it stands next
          to, quiet enough for a dense list. The three overrides are the three
          reasons in this file's header comment, in order. */}
      <Button
        variant="outline"
        size="icon-sm"
        className={cn(
          // PAIRING: icon-sm is 28px, the chip is 30px.
          "size-[30px]",
          // ui/button's `icon-*` sizes state no padding, because upstream sits
          // on a preflight that has already zeroed the browser's own. This app
          // imports no preflight, so a bare <button> keeps the UA's
          // `padding: 1px 6px` -- harmless inside a border-box square with a
          // centred icon, measured at 1px 6px on the built page, but stated
          // here rather than left to chance.
          "p-[0px]",
          // ICON SIZE: icon-sm would draw the plus at 14px; icons.tsx says 12.
          "[&_svg:not([class*='size-'])]:size-[12px]",
          // COLOUR, put back. `outline` rests on border-line/bg-panel and
          // hovers to bg-panel-2; this button has always rested on the
          // stronger line over the raised panel and hovered to the accent.
          "border-line-strong bg-panel-2 text-muted",
          "hover:border-accent hover:bg-accent-soft hover:text-accent",
        )}
        type="submit"
        title={t("common.add")}
        aria-label={t("common.add")}
      >
        <PlusIcon />
      </Button>
    </form>
  );
}
