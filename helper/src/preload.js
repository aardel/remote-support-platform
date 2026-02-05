const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('helperApi', {
  getInfo: () => ipcRenderer.invoke('helper:get-info'),
  checkPending: () => ipcRenderer.invoke('helper:check-pending'),
  registerDevice: (allowUnattended) => ipcRenderer.invoke('helper:register-device', allowUnattended),
  registerSession: (payload) => ipcRenderer.invoke('helper:register-session', payload),
  startVnc: () => ipcRenderer.invoke('helper:start-vnc')
});
