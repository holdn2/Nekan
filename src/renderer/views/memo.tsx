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
import { clampMemo } from "../../shared/core.js";
import { t } from "../i18n.js";
import { accel } from "../keys.js";
import { setMemo } from "../store.js";
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
  if (seenSeed !== seed) {
    setSeenSeed(seed);
    setValue(memo);
  }

  const input = useRef<HTMLTextAreaElement>(null);
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

  // clampMemo trims the way the save path does, so what the button compares is
  // what would actually be written.
  const trimmed = clampMemo(value);
  const original = task.memo || null;
  const canSave = Boolean(trimmed) && trimmed !== original;

  const save = () => {
    if (!canSave) return;
    setMemoEditing(false);
    setMemo(task.id, trimmed);
  };

  /** Esc / Cancel: back to reading, or close outright if there was nothing yet. */
  const cancel = () => {
    if (!original) {
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
          onChange={(e) => setValue(e.target.value)}
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
        <GhostButton
          danger
          className={cn(FOOT_BTN, (editing || !original) && "hidden")}
          id="memoDelete"
          onClick={remove}
        >
          {t("common.delete")}
        </GhostButton>
        <GhostButton
          className={cn(FOOT_BTN, (!editing || !original) && "hidden")}
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
