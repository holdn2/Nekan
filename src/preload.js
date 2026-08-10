const { contextBridge, ipcRenderer } = require("electron");

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
const flag = (name) => {
  const prefix = `--nekan-${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : "";
};

const language = flag("lang") || null;
const languages = flag("langs").split(",").filter(Boolean);

contextBridge.exposeInMainWorld("api", {
  language,
  languages,
  setLanguage: (next) => ipcRenderer.invoke("settings:language", next),
  load: () => ipcRenderer.invoke("state:load"),
  save: (tasks) => ipcRenderer.invoke("state:save", tasks),
  collapse: () => ipcRenderer.invoke("win:collapse"),
  expand: () => ipcRenderer.invoke("win:expand"),
  minimize: () => ipcRenderer.invoke("win:minimize"),
  close: () => ipcRenderer.invoke("win:close"),
  togglePin: () => ipcRenderer.invoke("win:togglePin"),
  setTheme: (theme) => ipcRenderer.invoke("settings:theme", theme),
  setLayout: (layout) => ipcRenderer.invoke("settings:layout", layout),
  setMemoPanel: (open, height) => ipcRenderer.invoke("win:memo", open, height),
  setInboxOpen: (open) => ipcRenderer.invoke("settings:inbox", open),
  setSpace: (space) => ipcRenderer.invoke("settings:space", space),
  setStartupChoice: (choice) => ipcRenderer.invoke("settings:startup", choice),
  exportBoard: () => ipcRenderer.invoke("export:run"),
  revealExport: (target) => ipcRenderer.invoke("export:reveal", target),
  // Auth. Note what is missing: there is no getToken. The renderer can start a
  // session and end one, and can learn the email from load(), but the tokens
  // themselves stay in the main process.
  //
  // `mode` is what to do with the tasks already on this machine: "merge" or
  // "replace". devLogin only answers in a development run — ipc.js does not
  // register that channel in a packaged build, so it rejects there.
  signInWithGoogle: (mode) => ipcRenderer.invoke("auth:google", mode),
  cancelSignIn: () => ipcRenderer.invoke("auth:cancel"),
  devLogin: (email, password, mode) =>
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
  onMode: (cb) => ipcRenderer.on("win:mode", (_e, mode) => cb(mode)),
  onUpdateStatus: (cb) =>
    ipcRenderer.on("update:status", (_e, status) => cb(status)),
  // A pull applied rows. The list is the merged one, so the renderer replaces
  // rather than merges again — and must not save it back, or every device
  // would answer every sync with a sync.
  onSyncTasks: (cb) =>
    ipcRenderer.on("sync:tasks", (_e, tasks, clockOffset, overwritten) =>
      cb(tasks, clockOffset, overwritten),
    ),
  onSyncStatus: (cb) =>
    ipcRenderer.on("sync:status", (_e, status) => cb(status)),
});
