import { contextBridge, ipcRenderer } from "electron";

/**
 * The interface language, read synchronously so the renderer has it on its very
 * first line. Everything else here is a round trip and therefore lands after
 * the first paint, which for a language would mean rendering one and then
 * swapping. main puts it in argv when it builds the window.
 */
// The list of languages rides along for the same reason the current one does:
// the picker has to be able to draw itself. It cannot be `require`d from
// shared/ — this preload is sandboxed, where `require` serves a short list of
// Electron built-ins and nothing else, and reaching for a local file there
// takes the whole preload down. `window.api` then does not exist at all, which
// looks nothing like a bad import and everything like the app being broken.
const flag = (name: string) => {
  const prefix = `--nekan-${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : "";
};

const language = flag("lang") || null;
const languages = flag("langs").split(",").filter(Boolean);

/**
 * Which OS, for the one thing the renderer cannot work out for itself: the
 * accelerator key is Cmd on macOS and Ctrl everywhere else, and those are two
 * different fields on a KeyboardEvent.
 *
 * `process.platform` is one of the few things a sandboxed preload still has --
 * no `require`, no argv flag needed -- so this costs nothing and, like the
 * language above, is in hand before the first keystroke rather than an IPC
 * round trip later.
 */
const platform = process.platform;

/**
 * Everything the renderer is allowed to reach, and the only thing it can.
 *
 * Named rather than passed straight in so its type can be handed across: the
 * renderer declares `window.api` as `typeof api`, which means the boundary is
 * described once. A channel added here shows up over there without anybody
 * writing it down twice -- the mistake core-bridge used to invite.
 */
/**
 * What main pushes, named here because this file is where the renderer's view
 * of the boundary comes from -- window.api is `typeof api`, so a callback typed
 * here is a callback typed over there.
 */
interface UpdateStatus {
  /** Always present: main starts at "idle" and only ever replaces it. */
  state: string;
  /** Null until there is a version on offer, which is most of the time. */
  version: string | null;
}

interface SyncStatus {
  state: string;
  unsent: number;
  session?: { userId: string | null; email: string | null } | null;
}

const api = {
  language,
  languages,
  platform,
  setLanguage: (next: string) => ipcRenderer.invoke("settings:language", next),
  load: () => ipcRenderer.invoke("state:load"),
  save: (tasks: unknown) => ipcRenderer.invoke("state:save", tasks),
  collapse: () => ipcRenderer.invoke("win:collapse"),
  expand: () => ipcRenderer.invoke("win:expand"),
  minimize: () => ipcRenderer.invoke("win:minimize"),
  close: () => ipcRenderer.invoke("win:close"),
  togglePin: () => ipcRenderer.invoke("win:togglePin"),
  setTheme: (theme: string) => ipcRenderer.invoke("settings:theme", theme),
  setLayout: (layout: unknown) => ipcRenderer.invoke("settings:layout", layout),
  setInboxOpen: (open: boolean) => ipcRenderer.invoke("settings:inbox", open),
  setSpace: (space: string) => ipcRenderer.invoke("settings:space", space),
  setStartupChoice: (choice: string) =>
    ipcRenderer.invoke("settings:startup", choice),
  exportBoard: () => ipcRenderer.invoke("export:run"),
  revealExport: (target: string) => ipcRenderer.invoke("export:reveal", target),
  // Auth. Note what is missing: there is no getToken. The renderer can start a
  // session and end one, and can learn the email from load(), but the tokens
  // themselves stay in the main process.
  //
  // `mode` is what to do with the tasks already on this machine: "merge" or
  // "replace". devLogin only answers in a development run — ipc.js does not
  // register that channel in a packaged build, so it rejects there.
  signInWithGoogle: (mode: string) => ipcRenderer.invoke("auth:google", mode),
  cancelSignIn: () => ipcRenderer.invoke("auth:cancel"),
  devLogin: (email: string, password: string, mode: string) =>
    ipcRenderer.invoke("auth:login", email, password, mode),
  logout: () => ipcRenderer.invoke("auth:logout"),
  // Deletes the account on the server. The tasks on this computer are not part
  // of it — see the account panel, which says so before offering the button.
  deleteAccount: () => ipcRenderer.invoke("account:delete"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  openReleaseNotes: () => ipcRenderer.invoke("update:notes"),
  // Opens the policy page for the language the app is in. Like the releases
  // link, it takes nothing — the renderer cannot choose what gets opened.
  openPrivacyPolicy: () => ipcRenderer.invoke("legal:privacy"),
  onMode: (cb: (mode: string) => void) =>
    ipcRenderer.on("win:mode", (_e, mode) => cb(mode)),
  onUpdateStatus: (cb: (status: UpdateStatus) => void) =>
    ipcRenderer.on("update:status", (_e, status) => cb(status)),
  // A pull applied rows. The list is the merged one, so the renderer replaces
  // rather than merges again — and must not save it back, or every device
  // would answer every sync with a sync.
  onSyncTasks: (
    cb: (tasks: unknown, clockOffset: number, overwritten: number) => void,
  ) =>
    ipcRenderer.on("sync:tasks", (_e, tasks, clockOffset, overwritten) =>
      cb(tasks, clockOffset, overwritten),
    ),
  onSyncStatus: (cb: (status: SyncStatus) => void) =>
    ipcRenderer.on("sync:status", (_e, status) => cb(status)),
};

contextBridge.exposeInMainWorld("api", api);

/** The shape of window.api, for the renderer's global declaration. */
export type NekanApi = typeof api;
