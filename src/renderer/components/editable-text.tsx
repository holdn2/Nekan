/**
 * A task's text, edited where it sits.
 *
 * contentEditable rather than a swapped-in <input> so the row does not change
 * size or lose its place in the list while it is being edited -- the same
 * reason views/inline-edit.ts does it that way for the rows that are still
 * hand-built. When the matrix crosses over, that file goes and this is what
 * both use.
 *
 * React does not own the text while the edit is open. It cannot: the browser
 * is writing into the node as somebody types, and re-rendering over that would
 * put the caret back at the start. So the element is left uncontrolled --
 * suppressContentEditableWarning says that is deliberate -- and the value only
 * goes back into the store when the edit finishes.
 */

import { useEffect, useRef, useState } from "react";

interface Props {
  /** What the store holds. Shown whenever an edit is not open. */
  value: string;
  /** Called with the new text on commit. An empty one deletes the task. */
  onCommit: (text: string) => void;
  /** Dragging is switched off while editing -- see below. */
  setDraggable?: (on: boolean) => void;
  className?: string;
  title?: string;
}

export function EditableText({
  value,
  onCommit,
  setDraggable,
  className = "text",
  title,
}: Props) {
  const [editing, setEditing] = useState(false);
  const el = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = el.current;
    if (!editing || !node) return;

    // A text selection inside a draggable element starts a drag instead of
    // selecting, so the row stops being draggable for the duration.
    setDraggable?.(false);
    node.textContent = value;
    node.focus();

    // Select what is there, so typing replaces it. There is no selection to
    // move when the document is not focused, and that is not a failure -- the
    // edit still opens, it just does not start selected.
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }

    return () => setDraggable?.(true);
  }, [editing, value, setDraggable]);

  /** Leave edit mode; `commit` decides whether the typing survives. */
  const finish = (commit: boolean) => {
    const node = el.current;
    setEditing(false);
    if (!node) return;
    const typed = node.textContent ?? "";
    // Put the stored text back before React sees the node again, so a cancel
    // does not leave the abandoned typing on screen for a frame.
    node.textContent = value;
    if (commit && typed !== value) onCommit(typed);
  };

  return (
    <span
      ref={el}
      className={className}
      title={editing ? undefined : title}
      contentEditable={editing}
      suppressContentEditableWarning
      onDoubleClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (!editing) return;
        // An IME is mid-word. The Enter that commits a Korean syllable and the
        // Escape that abandons one arrive here first, and without this they
        // would finish the edit instead -- one keystroke doing two jobs, the
        // second of which nobody asked for.
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter") {
          e.preventDefault();
          finish(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(false);
        }
      }}
      // Clicking away is how most people finish, so a blur commits.
      onBlur={() => editing && finish(true)}
    >
      {value}
    </span>
  );
}
