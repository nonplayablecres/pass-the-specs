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
  mediaAccess: (kind) => ipcRenderer.invoke('pts:media-access', kind),
  touchId: (action) => ipcRenderer.invoke('pts:touch-id', action),
  batteryReport: (name) => ipcRenderer.invoke('pts:battery-report', name),
  saveReport: (name, text) => ipcRenderer.invoke('pts:save-report', { name, text }),
  factoryReset: () => ipcRenderer.invoke('pts:factory-reset'),
  drives: () => ipcRenderer.invoke('pts:drives'),
  driveScan: (opts) => ipcRenderer.invoke('pts:drive-scan', opts),
  driveSpeed: (opts) => ipcRenderer.invoke('pts:drive-speed', opts),
  driveStop: () => ipcRenderer.invoke('pts:drive-stop'),
  driveCapacity: (opts) => ipcRenderer.invoke('pts:drive-capacity', opts),
  driveProbe: (opts) => ipcRenderer.invoke('pts:drive-probe', opts),
  onDriveProgress: (fn) => {
    const handler = (_e, p) => fn(p);
    ipcRenderer.on('pts:drive-progress', handler);
    return () => ipcRenderer.removeListener('pts:drive-progress', handler);
  },
  onUpdate: (fn) => {
    const handler = (_e, info) => fn(info);
    ipcRenderer.on('pts:update', handler);
    return () => ipcRenderer.removeListener('pts:update', handler);
  }
});
