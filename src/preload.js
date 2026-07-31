const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('state:load'),
  save: (tasks) => ipcRenderer.invoke('state:save', tasks),
  collapse: () => ipcRenderer.invoke('win:collapse'),
  expand: () => ipcRenderer.invoke('win:expand'),
  minimize: () => ipcRenderer.invoke('win:minimize'),
  close: () => ipcRenderer.invoke('win:close'),
  togglePin: () => ipcRenderer.invoke('win:togglePin'),
  setTheme: (theme) => ipcRenderer.invoke('settings:theme', theme),
  setLayout: (layout) => ipcRenderer.invoke('settings:layout', layout),
  onMode: (cb) => ipcRenderer.on('win:mode', (_e, mode) => cb(mode)),
});
