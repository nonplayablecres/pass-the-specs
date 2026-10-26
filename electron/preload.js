// The only bridge between the screens and the computer.
// Screens call window.pts.systemInfo() etc. Nothing else from Node is exposed.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pts', {
  systemInfo: () => ipcRenderer.invoke('pts:system-info'),
  appInfo: () => ipcRenderer.invoke('pts:app-info'),
  copy: (text) => ipcRenderer.invoke('pts:copy', text),
  reload: () => ipcRenderer.invoke('pts:reload'),
  openRelease: (url) => ipcRenderer.invoke('pts:open', url),
  openUrl: (url) => ipcRenderer.invoke('pts:open', url),
  ports: () => ipcRenderer.invoke('pts:ports'),
  cexSearch: (query) => ipcRenderer.invoke('pts:cex-search', query),
  saveReport: (name, text) => ipcRenderer.invoke('pts:save-report', { name, text }),
  factoryReset: () => ipcRenderer.invoke('pts:factory-reset'),
  onUpdate: (fn) => {
    const handler = (_e, info) => fn(info);
    ipcRenderer.on('pts:update', handler);
    return () => ipcRenderer.removeListener('pts:update', handler);
  }
});
