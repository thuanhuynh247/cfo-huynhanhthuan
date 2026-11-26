const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("DESKTOP", {
  isDesktop: true,
  saveText: (name, text) => ipcRenderer.invoke("file:saveText", name, text),
  openExternal: (u) => ipcRenderer.invoke("shell:openExternal", u),
  openPath: (p) => ipcRenderer.invoke("shell:openPath", p),
  info: () => ipcRenderer.invoke("app:info"),
});
