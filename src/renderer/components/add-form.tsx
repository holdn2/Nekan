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
 */

import { useRef, useState } from "react";
import type { Place } from "../../shared/types.js";
import { t } from "../i18n.js";
import { addTask } from "../store.js";
import { cn } from "../react/cn.js";
import { DueChip } from "./due-chip.js";
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
      className={cn(
        "add flex gap-sm border-t border-line p-md",
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
      <input
        ref={input}
        className={cn(
          "min-w-[0px] flex-auto rounded-md border border-line-strong",
          // font-[inherit] is the family only. The rule this replaced said
          // `font: inherit`, and the shorthand cannot come back: Tailwind
          // emits arbitrary properties after the leading-* utilities, so it
          // would carry an inherited line-height. The size is asked for by
          // name instead; the weight already matches what a text input
          // inherits, so there is nothing to say about it.
          "bg-input-bg px-lg py-sm font-[inherit] text-md text-text",
          "outline-none select-text placeholder:text-faint",
          "focus:border-accent focus:shadow-[0_0_0_2px_var(--accent-soft)]",
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
      {/* The + is drawn; see react/icons.tsx. Centring is the flexbox's job.
          The box is stated in full -- both axes -- because this button and the
          due chip beside it are read as a pair, and it was neither: 32px wide
          against the chip's 30, and no height at all, so it stretched to the
          text input's 31.2 and stood 1.2px taller as well. A height also has
          to be set to *stop* stretching; self-center then puts the shorter box
          back on the row's centre line. */}
      <button
        className={cn(
          "inline-flex h-[30px] w-[30px] items-center justify-center self-center",
          "rounded-md border border-line-strong bg-panel-2 p-[0px] text-muted",
          "hover:border-accent hover:bg-accent-soft hover:text-accent",
        )}
        type="submit"
        title={t("common.add")}
        aria-label={t("common.add")}
      >
        <PlusIcon />
      </button>
    </form>
  );
}
