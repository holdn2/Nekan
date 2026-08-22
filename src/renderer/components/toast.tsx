/**
 * The one-off confirmation strip at the bottom of the window.
 *
 * It exists for things that happen *outside* the window — a file written to
 * disk — where nothing on screen would otherwise change to say they worked.
 * Anything the lists already show is not toast material.
 *
 * This is the first piece to move to React (#73), and it was chosen because it
 * is the only one that owns a patch of the document nobody else touches. The
 * exported function keeps its old shape on purpose: three call sites go on
 * calling toast(message, options) and none of them know a component appeared.
 */

import { useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";

type ToastAction = { label: string; onClick: () => void };
type ToastOptions = {
  error?: boolean;
  action?: ToastAction | null;
  ms?: number;
};
type ToastState = {
  message: string;
  error: boolean;
  action: ToastAction | null;
  open: boolean;
};

const CLOSED: ToastState = {
  message: "",
  error: false,
  action: null,
  open: false,
};

/**
 * One value and the components watching it. A store rather than a setState
 * handed out through a module variable, because useSyncExternalStore reads the
 * current value on the first render -- a toast raised before React has mounted
 * is therefore shown, not swallowed.
 */
let state: ToastState = CLOSED;
const listeners = new Set<() => void>();

function publish(next: ToastState) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function Toast() {
  const { message, error, action, open } = useSyncExternalStore(
    subscribe,
    () => state,
  );

  // Always rendered, never conditional: `.toast.hidden` fades out rather than
  // disappearing, and an element React has unmounted cannot animate on its way
  // off screen. The ids stay for the same reason the classes do -- the
  // stylesheet and anything looking at this from outside still name them.
  return (
    <div
      id="toast"
      className={`toast${open ? "" : " hidden"}${error ? " error" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span id="toastText" className="toast-text">
        {message}
      </span>
      <button
        id="toastAct"
        className={`toast-act${action ? "" : " hidden"}`}
        type="button"
        onClick={action ? action.onClick : undefined}
      >
        {action ? action.label : ""}
      </button>
    </div>
  );
}

let root: Root | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Mount on first use rather than from init().
 *
 * init() is where mounting would naturally go, except that the one caller that
 * matters most is init()'s own failure handler -- a toast raised because the
 * app did not start cannot depend on the app having started.
 */
function ensureRoot() {
  if (root) return;
  const host = document.getElementById("toastRoot");
  if (!host) return;
  root = createRoot(host);
  root.render(<Toast />);
}

/**
 * Show `message` for `ms`. `error` tints it red, and `action`
 * ({ label, onClick }) adds a single button — replaced on every call so a stale
 * one from an earlier toast can never linger with the wrong handler.
 */
export function toast(
  message: string,
  { error = false, action = null, ms = 4000 }: ToastOptions = {},
) {
  ensureRoot();
  publish({ message, error, action, open: true });
  if (timer) clearTimeout(timer);
  // The message survives the close so the strip has something to fade with.
  timer = setTimeout(() => publish({ ...state, open: false }), ms);
}
