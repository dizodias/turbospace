const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('turboWindow', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  setBootMode: (enabled) => ipcRenderer.invoke('window:setBootMode', enabled),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  onMaximizedChange: (cb) => {
    const handler = (_event, value) => cb(value);
    ipcRenderer.on('window:maximized', handler);
    return () => ipcRenderer.removeListener('window:maximized', handler);
  },
});
