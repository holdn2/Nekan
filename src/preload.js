const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
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
  installUpdate: () => ipcRenderer.invoke("update:install"),
  openReleaseNotes: () => ipcRenderer.invoke("update:notes"),
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
