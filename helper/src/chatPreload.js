const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chatApi', {
  sendMessage: (msg) => ipcRenderer.invoke('chat:send-message', msg),
  onMessage: (callback) => ipcRenderer.on('chat:new-message', (_event, data) => callback(data)),
  onHistory: (callback) => ipcRenderer.on('chat:history', (_event, messages) => callback(messages)),
  requestHistory: () => ipcRenderer.invoke('chat:request-history')
});
