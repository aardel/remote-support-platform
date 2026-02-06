const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('helperApi', {
  getInfo: () => ipcRenderer.invoke('helper:get-info'),
  checkPending: () => ipcRenderer.invoke('helper:check-pending'),
  assignSession: (allowUnattended) => ipcRenderer.invoke('helper:assign-session', allowUnattended),
  registerDevice: (allowUnattended) => ipcRenderer.invoke('helper:register-device', allowUnattended),
  registerSession: (payload) => ipcRenderer.invoke('helper:register-session', payload),

  // Screen capture APIs
  getSources: () => ipcRenderer.invoke('helper:get-sources'),
  getDisplayInfo: () => ipcRenderer.invoke('helper:get-display-info'),

  // Socket.io signaling APIs
  socketConnect: (sessionId) => ipcRenderer.invoke('helper:socket-connect', sessionId),
  socketSendOffer: (data) => ipcRenderer.invoke('helper:socket-send-offer', data),
  socketSendIce: (data) => ipcRenderer.invoke('helper:socket-send-ice', data),
  socketDisconnect: () => ipcRenderer.invoke('helper:socket-disconnect'),

  // Signaling event listeners
  onWebrtcAnswer: (callback) => ipcRenderer.on('signaling:webrtc-answer', (_event, data) => callback(data)),
  onWebrtcIceCandidate: (callback) => ipcRenderer.on('signaling:webrtc-ice-candidate', (_event, data) => callback(data)),
  onPeerJoined: (callback) => ipcRenderer.on('signaling:peer-joined', (_event, data) => callback(data)),

  // Remote control APIs (for receiving technician input)
  onMouseEvent: (callback) => ipcRenderer.on('signaling:remote-mouse', (_event, data) => callback(data)),
  onKeyboardEvent: (callback) => ipcRenderer.on('signaling:remote-keyboard', (_event, data) => callback(data))
});
