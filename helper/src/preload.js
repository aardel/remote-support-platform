const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('helperApi', {
  getInfo: () => ipcRenderer.invoke('helper:get-info'),
  checkPending: () => ipcRenderer.invoke('helper:check-pending'),
  registerDevice: (allowUnattended) => ipcRenderer.invoke('helper:register-device', allowUnattended),
  registerSession: (payload) => ipcRenderer.invoke('helper:register-session', payload),

  // Screen capture APIs
  getSources: () => ipcRenderer.invoke('helper:get-sources'),
  getDisplayInfo: () => ipcRenderer.invoke('helper:get-display-info'),

  // Remote control APIs (for receiving technician input)
  onMouseEvent: (callback) => ipcRenderer.on('mouse-event', (_event, data) => callback(data)),
  onKeyboardEvent: (callback) => ipcRenderer.on('keyboard-event', (_event, data) => callback(data))
});
