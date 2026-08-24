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
      // The dump's add box never gives up height: when the window is too short
      // the list above shrinks and scrolls, because a panel you cannot type
      // into is not a smaller panel, it is a broken one.
      className={withDue ? "add" : "add inbox-add flex-none"}
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
      {withDue ? <DueChip value={due} onChange={setDue} /> : null}
      <button
        type="submit"
        title={t("common.add")}
        aria-label={t("common.add")}
      >
        <PlusIcon />
      </button>
    </form>
  );
}
