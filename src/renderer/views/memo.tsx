/**
 * One memo per task, shown in a panel under the matrix.
 *
 * The panel takes its height out of the matrix, the way the brain dump above
 * does, and the whole of that happens in CSS: --memo-h sizes it and the grid
 * shrinks to fit. Nothing here talks to main -- opening a note does not move
 * the window.
 *
 * Which task is selected lives in selection.js, not here: the matrix and the
 * title bar both need to know, and neither of them wants this panel.
 *
 * The <section> itself stays in index.html and React fills it. That is not
 * squeamishness: it is a flex child the layout sizes with --memo-h, and
 * window/layout.js finds it by id to drag its top edge. Wrapping it in a root
 * of our own would put a div between the two and quietly break both.
 */

import { useEffect, useRef, useState } from "react";
import { Dot } from "../components/dot.js";
import { GhostButton } from "../components/ghost-button.js";
import { createRoot } from "react-dom/client";
import { DRAFT_SAVE_MS, INBOX, clampMemo } from "../../shared/core.js";
import { isBuried } from "../../shared/sync/rows.js";
import { t } from "../i18n.js";
import { accel } from "../keys.js";
import { findTask, setMemo } from "../store.js";
import { registerDraftFlusher } from "../drafts.js";
import {
  isMemoEditing,
  selectedTask,
  setMemoEditing,
  setSelected,
} from "../selection.js";
import { useRenderSignal } from "../react/use-store.js";
import { CloseIcon } from "../react/icons.js";
import { cn } from "../react/cn.js";
import { Textarea } from "../components/ui/textarea.js";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog.js";

/**
 * The footer's buttons are smaller than a ghost button elsewhere. These land
 * after the component's own padding inside cn(), so they replace it rather
 * than adding a second padding and hoping the right one wins.
 */
const FOOT_BTN = "px-xl py-xs text-sm";
/**
 * How long the footer says "saved" for.
 *
 * Long enough to catch out of the corner of an eye, short enough that it is
 * gone before the next pause -- a panel that says it forever says nothing.
 */
export const SAID_MS = 2000;
/** Nothing owed · a pause is owed · one just wrote. */
type Status = "idle" | "saving" | "saved";
/** The quadrant colours, spelled out so Tailwind's source scan can see them. */
const QUAD_RULE: Record<string, string> = {
  q1: "border-t-q1",
  q2: "border-t-q2",
  q3: "border-t-q3",
  q4: "border-t-q4",
};

export function MemoPanel() {
  useRenderSignal();
  const task = selectedTask();
  const memo = task?.memo ?? "";
  // A task with no note yet opens straight into the editor: there is nothing to
  // read, and asking someone to double-click an empty box to begin is a step
  // that exists only because the state machine has two states.
  const editing = isMemoEditing() || !memo;

  // What the textarea is currently showing, and what it was seeded from. The
  // seed is compared during render rather than watched with an effect: when the
  // panel changes what it is showing the text is replaced, and on every other
  // render it is left strictly alone -- so a sync landing mid-sentence cannot
  // wipe what is being typed.
  const seed = `${task?.id ?? ""}:${editing}`;
  const [seenSeed, setSeenSeed] = useState(seed);
  const [value, setValue] = useState(memo);
  // Whether the "are you sure" sheet is up. Held here rather than by an
  // AlertDialogTrigger: the button that opens it is the footer's ghost button,
  // and Trigger would need `asChild` to lend its behaviour to one -- which the
  // port dropped, because the umbrella package's Slot is not a dependency.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // The note as it stood when the editor opened -- what Cancel puts back, now
  // that what is stored may already be the draft. State rather than a ref,
  // because whether the Cancel button shows is drawn from it.
  const [opened, setOpened] = useState<string | null>(memo || null);
  // The last text a pause wrote from this editor. Cancel only undoes that: a
  // stored note that is anything else was changed by something other than this
  // editor -- a sync from another device -- and writing the old text back
  // would erase that edit on every device.
  const lastWritten = useRef<string | null>(null);
  // What the footer says about what has been typed: nothing, "saving" while a
  // pause is still owed, "saved" for a moment after one wrote.
  //
  // The write itself is instant -- the second of waiting *is* the pause -- so
  // "saving" is the honest word for the one state a person can act on: what is
  // on screen is not in the file yet, and closing the lid now would lose it.
  const [status, setStatus] = useState<Status>("idle");
  const linger = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useRef((next: Status) => {
    if (linger.current) {
      clearTimeout(linger.current);
      linger.current = null;
    }
    setStatus(next);
    if (next === "saved")
      linger.current = setTimeout(() => setStatus("idle"), SAID_MS);
  });
  useEffect(
    () => () => {
      if (linger.current) clearTimeout(linger.current);
    },
    [],
  );
  if (seenSeed !== seed) {
    setSeenSeed(seed);
    setValue(memo);
    setOpened(memo || null);
    lastWritten.current = null;
    // Another task's receipt is not this one's.
    setStatus("idle");
  }

  // What has been typed and not yet written, and which task it belongs to.
  //
  // Written on a pause rather than only on Save (issue 136). A note used to live in
  // this component alone until the button was pressed, so closing the window,
  // clicking another task or folding to the bar threw it away without a word --
  // while a task's title, edited in place, was already saved on blur.
  //
  // A ref set only by typing, never during render: a switch to another task
  // resets `value` in that same render, and a draft read from `value` would
  // already be the next task's note.
  const draft = useRef<{ id: string; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // An IME is mid-syllable, and its half-built text is not worth a write.
  const composing = useRef(false);

  const flush = useRef(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const pending = draft.current;
    draft.current = null;
    if (!pending) return;
    // An empty field is never written. Deleting a note asks first, and a pause
    // after clearing the field to start over is not that question answered.
    const text = clampMemo(pending.text);
    const target = findTask(pending.id);
    if (!text || !target || target.memo === text) {
      // Nothing to write -- an empty field, or the very words already stored.
      // Saying "saving" about it would be a promise of a write that is not
      // coming.
      say.current("idle");
      return;
    }
    // A pull can bury the row or move it to the brain dump while it is being
    // typed into. A tombstone holds no words and a dump row holds no note --
    // main would drop the first on save, but the renderer would keep both.
    if (isBuried(target) || target.quadrant === INBOX) {
      say.current("idle");
      return;
    }
    // A task with no note is in the editor *because* it has none. The first
    // write gives it one, and without saying "still editing" the panel would
    // flip to reading under the cursor.
    if (pending.id === selectedTask()?.id) {
      if (!isMemoEditing()) setMemoEditing(true);
      lastWritten.current = text;
    }
    setMemo(pending.id, text);
    say.current("saved");
  });

  const schedule = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush.current(), DRAFT_SAVE_MS);
  };

  // What takes the panel away on purpose asks for this first -- the selection
  // changing, the bar folding, the window closing (see drafts.ts).
  useEffect(() => registerDraftFlusher(() => flush.current()), []);
  // What takes it away without asking leaves through here: the task completed
  // or trashed under it, the other board switched to, the panel unmounting.
  const taskId = task?.id ?? null;
  useEffect(() => () => flush.current(), [taskId]);

  const input = useRef<HTMLTextAreaElement>(null);
  /**
   * Where focus goes when the delete question closes.
   *
   * Radix hands it back to its own Trigger, and this dialog has none -- it is
   * opened from state so the footer button stays an ordinary button. Without
   * this, Cancel and Escape both leave focus on <body> and a keyboard loses
   * its place in the panel.
   *
   * An effect keyed on the flag rather than onCloseAutoFocus: that fires
   * inside Radix's own teardown, and whether the layer blurs afterwards
   * depends on the order the microtasks happen to run in -- the same press
   * restored focus or did not from one run to the next. This runs after React
   * has committed the unmount, which is the same moment every time. The
   * archive's bulk question does it the same way, for the same reason.
   */
  const removeBtn = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirmingDelete) {
      wasConfirming.current = true;
      return;
    }
    if (!wasConfirming.current) return;
    wasConfirming.current = false;
    removeBtn.current?.focus();
  }, [confirmingDelete]);
  useEffect(() => {
    if (!editing) return;
    const el = input.current;
    if (!el) return;
    el.focus();
    // Caret at the end rather than selecting the lot: reopening a note is
    // usually to add to it, and a select-all is one keystroke from losing it.
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing, seed]);

  // The host is a flex child of the layout, so its own class is the only thing
  // about it we touch -- the rest of the section belongs to index.html.
  useEffect(() => {
    document.getElementById("memoPanel")?.classList.toggle("hidden", !task);
  }, [task]);

  if (!task) return null;

  // clampMemo trims the way the save path does. The button no longer waits for
  // a difference: a pause may already have written this very text, and Save is
  // then "I am done here", which is still worth a button.
  const trimmed = clampMemo(value);
  const original = task.memo || null;
  const canSave = Boolean(trimmed);

  const save = () => {
    if (!canSave) return;
    // Whatever was typed is written by the flush, and that is all. The field is
    // a copy from when the editor opened: writing it again when nothing was
    // typed would put it back over a note a sync has changed since -- and with
    // Save meaning "done", pressing it untouched is the ordinary way out.
    flush.current();
    // A note with no words cannot be read, so "back to reading" would leave the
    // editor up and the button would look dead. That happens when a sync
    // empties the note while the editor sits open and untouched.
    if (!task.memo) {
      setSelected(null);
      return;
    }
    setMemoEditing(false);
  };

  /**
   * Esc / Cancel: put the note back as it was when the editor opened, then back
   * to reading -- or close outright if there was nothing yet.
   *
   * Putting it back, not just leaving: a pause may have written the draft
   * already, so walking away no longer throws it away by itself.
   */
  const cancel = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    draft.current = null;
    const before = opened;
    // Only what this editor wrote is undone -- see `lastWritten`.
    if (lastWritten.current !== null && task.memo === lastWritten.current) {
      setMemo(task.id, before);
    }
    lastWritten.current = null;
    // Undone, so there is nothing owed and nothing to show a receipt for.
    say.current("idle");
    // Nothing to go back to -- or nothing left, when a sync emptied the note
    // while it was open. Either way reading would show an empty panel.
    if (!before || !task.memo) {
      setSelected(null);
      return;
    }
    setMemoEditing(false);
  };

  /**
   * Ask first: there is no undo for this.
   *
   * The question used to be window.confirm(), which on a frameless widget is an
   * OS window opening on top of it -- the same seam the native date picker and
   * the native <select> were taken out for. It is a Radix alert dialog now, so
   * it is drawn inside the app and keeps Escape and the focus trap.
   */
  const remove = () => {
    if (!original) return;
    setConfirmingDelete(true);
  };

  /** Said yes. */
  const confirmRemove = () => {
    setConfirmingDelete(false);
    setMemoEditing(false);
    setMemo(task.id, null);
  };

  return (
    <div
      className={cn(
        "memo-card flex min-h-[0px] flex-auto flex-col overflow-hidden",
        "rounded-panel border border-line border-t-2 bg-panel",
        "shadow-default",
        // The quadrant this note belongs to, not the accent. The panel is
        // about one task and the dot beside its title already says which
        // quadrant that is; the rule agreeing costs nothing and makes the
        // panel legible from the corner of an eye.
        //
        // Written out rather than composed. Tailwind reads the source as text
        // (@source in styles/index.css), so a class built at runtime from
        // `border-t-${quadrant}` is a name nothing ever emitted a rule for --
        // the border would simply be missing, with no error anywhere.
        QUAD_RULE[task.quadrant] ?? "border-t-accent",
      )}
    >
      <header className="memo-head flex items-center gap-md border-b border-line py-sm pr-sm pl-xl">
        <Dot place={task.quadrant} id="memoDot" />
        <span
          className="memo-title min-w-[0px] flex-auto overflow-hidden font-medium text-ellipsis whitespace-nowrap"
          id="memoTitle"
          title={task.text}
        >
          {task.text}
        </span>
        <button
          className={cn(
            "memo-x grid h-[24px] w-[24px] flex-none place-items-center",
            "rounded-sm border-0 bg-transparent text-sm leading-none text-faint",
            "hover:bg-panel-3 hover:text-text",
          )}
          id="memoClose"
          type="button"
          title={t("memo.close")}
          aria-label={t("memo.close")}
          onClick={() => setSelected(null)}
        >
          <CloseIcon />
        </button>
      </header>

      <div className="memo-body flex min-h-[0px] flex-auto px-lg pt-md pb-sm">
        <p
          className={cn(
            "memo-text m-[0px] min-h-[0px] flex-auto cursor-text overflow-y-auto",
            "px-md py-sm leading-normal [word-break:break-word] whitespace-pre-wrap",
            "select-text",
            editing && "hidden",
          )}
          id="memoText"
          title={t("memo.edit")}
          onDoubleClick={() => setMemoEditing(true)}
        >
          {memo}
        </p>
        <Textarea
          ref={input}
          id="memoInput"
          className={cn(
            // The port sizes itself to its content and floors at 64px. Both
            // have to go here: this field is a flex child of a panel whose
            // height is dragged from its top edge, so it must be free to
            // shrink to nothing and must not have an opinion of its own about
            // how tall it is. min-h-[0px] and field-sizing-fixed are what say
            // so; without them the editor pushes the panel past --memo-h and
            // body's overflow:hidden makes that look fixed.
            "min-h-[0px] flex-auto resize-none field-sizing-fixed",
            // font-[inherit] is the family only. The rule this replaced said
            // `font: inherit`, which is where the size came from too, and the
            // shorthand cannot come back: Tailwind emits arbitrary properties
            // after the leading-* utilities, so writing the shorthand here would
            // carry an inherited line-height over the one asked for below.
            // (Spelling it in this comment would also emit it -- @source reads
            // prose, so a class name written anywhere becomes a real rule.)
            "rounded-md px-md py-sm font-[inherit] leading-normal",
            // The size, the placeholder tone and the accent focus this used to
            // put back are the port's own now.
            "text-text select-text",
            !editing && "hidden",
          )}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            draft.current = { id: task.id, text: e.target.value };
            say.current("saving");
            if (!composing.current) schedule();
          }}
          onCompositionStart={() => {
            composing.current = true;
            // Korean ends one syllable and starts the next back to back. The
            // pause timer the last syllable started would otherwise fire in
            // the middle of this one and write "한ㄱ".
            if (timer.current) {
              clearTimeout(timer.current);
              timer.current = null;
            }
          }}
          onCompositionEnd={() => {
            composing.current = false;
            if (draft.current) schedule();
          }}
          // Clicking away is how most people finish, the same as a title.
          onBlur={() => flush.current()}
          placeholder={t("memo.placeholder")}
          aria-label={t("memo.field")}
          maxLength={2000}
          spellCheck={false}
          onKeyDown={(e) => {
            // An IME is mid-word: the Escape that abandons a Korean syllable
            // must not also close the note. Accelerator+Enter is safe either
            // way, but the guard belongs to the handler rather than to one
            // branch.
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            } else if (e.key === "Enter" && accel(e.nativeEvent)) {
              e.preventDefault();
              save();
            }
          }}
        />
      </div>

      {/* The hint that used to sit here ("double-click to edit", then the save
          and cancel keys) is gone: the buttons beside it already say what they
          do, and the panel only ever opens by the gesture it was describing.
          justify-end replaces the hint's flex-auto, which was what pushed these
          buttons to the right. `memo.edit` survives as the title on the body
          above -- that one is a tooltip, not a line of prose on screen. */}
      <footer className="memo-foot flex items-center justify-end gap-sm px-lg pb-md">
        {/* Left of the buttons, and absent when there is nothing to say. A live
            region rather than plain text, so a screen reader hears the receipt
            where it is instead of being sent to find it. */}
        <span
          className={cn(
            "mr-auto text-xs text-faint",
            status === "idle" && "hidden",
          )}
          id="memoStatus"
          role="status"
        >
          {status === "idle"
            ? // Emptied rather than unmounted: a live region that comes and
              // goes is announced unreliably, and one left holding "saved"
              // while the next sentence is typed is holding it about that
              // sentence.
              ""
            : status === "saving"
              ? t("common.saving")
              : t("common.saved")}
        </span>
        <GhostButton
          danger
          className={cn(FOOT_BTN, (editing || !original) && "hidden")}
          id="memoDelete"
          ref={removeBtn}
          onClick={remove}
        >
          {t("common.delete")}
        </GhostButton>
        <GhostButton
          // Whether there is anything to go back to is a question about when
          // the editor opened. A pause that gives an empty note its first words
          // would otherwise make this button appear under the cursor.
          className={cn(FOOT_BTN, (!editing || !opened) && "hidden")}
          id="memoCancel"
          onClick={cancel}
        >
          {t("common.cancel")}
        </GhostButton>
        <button
          className={cn(
            "primary rounded-md border border-accent bg-accent px-2xl py-xs",
            "text-sm text-on-accent",
            "hover:not-disabled:brightness-[1.07]",
            "disabled:cursor-default disabled:border-line disabled:bg-panel-3",
            "disabled:text-faint",
            !editing && "hidden",
          )}
          id="memoSave"
          type="button"
          disabled={!canSave}
          onClick={save}
        >
          {t("common.save")}
        </button>
      </footer>

      {/* Portals to the body, so it is not a child of the panel it is asking
          about -- and so the panel's own overflow:hidden cannot clip it.
          `memo.confirmDelete` is one sentence and is the whole question, so it
          is the title and there is no description: aria-describedby is passed
          as undefined to say that on purpose rather than leave Radix warning
          about a missing one. */}
      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent
          size="sm"
          id="memoDeleteConfirm"
          aria-describedby={undefined}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{t("memo.confirmDelete")}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel id="memoDeleteNo">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              id="memoDeleteYes"
              variant="destructive"
              onClick={confirmRemove}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Fill the panel that index.html left empty. Called once, from init(). */
export function mountMemo() {
  const host = document.getElementById("memoPanel");
  if (host) createRoot(host).render(<MemoPanel />);
}
