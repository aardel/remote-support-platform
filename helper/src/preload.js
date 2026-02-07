const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('helperApi', {
  getVersion: () => ipcRenderer.invoke('helper:get-version'),
  getCapabilities: () => ipcRenderer.invoke('helper:get-capabilities'),
  getInfo: () => ipcRenderer.invoke('helper:get-info'),
  checkPending: () => ipcRenderer.invoke('helper:check-pending'),
  assignSession: (allowUnattended) => ipcRenderer.invoke('helper:assign-session', allowUnattended),
  registerDevice: (allowUnattended) => ipcRenderer.invoke('helper:register-device', allowUnattended),
  registerSession: (payload) => ipcRenderer.invoke('helper:register-session', payload),

  // Screen capture APIs
  getSources: () => ipcRenderer.invoke('helper:get-sources'),
  getDisplayInfo: (displayIndex) => ipcRenderer.invoke('helper:get-display-info', displayIndex),
  getAllDisplays: () => ipcRenderer.invoke('helper:get-all-displays'),

  // Socket.io signaling APIs
  socketConnect: (sessionId) => ipcRenderer.invoke('helper:socket-connect', sessionId),
  socketSendOffer: (data) => ipcRenderer.invoke('helper:socket-send-offer', data),
  socketSendIce: (data) => ipcRenderer.invoke('helper:socket-send-ice', data),
  socketEmit: (event, data) => ipcRenderer.invoke('helper:socket-emit', event, data),
  socketDisconnect: () => ipcRenderer.invoke('helper:socket-disconnect'),

  // Signaling event listeners
  onWebrtcAnswer: (callback) => ipcRenderer.on('signaling:webrtc-answer', (_event, data) => callback(data)),
  onWebrtcIceCandidate: (callback) => ipcRenderer.on('signaling:webrtc-ice-candidate', (_event, data) => callback(data)),
  onPeerJoined: (callback) => ipcRenderer.on('signaling:peer-joined', (_event, data) => callback(data)),
  onTechniciansPresent: (callback) => ipcRenderer.on('signaling:technicians-present', (_event, data) => callback(data)),
  onTechnicianJoined: (callback) => ipcRenderer.on('signaling:technician-joined', (_event, data) => callback(data)),
  onTechnicianLeft: (callback) => ipcRenderer.on('signaling:technician-left', (_event, data) => callback(data)),

  // Remote control APIs (for receiving technician input)
  onMouseEvent: (callback) => ipcRenderer.on('signaling:remote-mouse', (_event, data) => callback(data)),
  onKeyboardEvent: (callback) => ipcRenderer.on('signaling:remote-keyboard', (_event, data) => callback(data)),

  // Technician requested monitor switch
  onSwitchMonitor: (callback) => ipcRenderer.on('signaling:switch-monitor', (_event, data) => callback(data)),

  // Stream quality preset (optimize for quality vs speed)
  onSetStreamQuality: (callback) => ipcRenderer.on('signaling:set-stream-quality', (_event, data) => callback(data)),

  // Chat
  openChatWindow: () => ipcRenderer.invoke('helper:open-chat-window'),
  onChatMessage: (callback) => ipcRenderer.on('signaling:chat-message', (_event, data) => callback(data)),

  // File transfer
  onFileAvailable: (callback) => ipcRenderer.on('signaling:file-available', (_event, data) => callback(data)),
  fileDownload: (url, defaultName) => ipcRenderer.invoke('helper:file-download', url, defaultName),
  filePickAndUpload: (sessionId, serverUrl) => ipcRenderer.invoke('helper:file-pick-upload', sessionId, serverUrl),

  // Update
  checkForUpdate: () => ipcRenderer.invoke('helper:check-for-update'),
  downloadUpdate: (downloadUrl) => ipcRenderer.invoke('helper:download-update', downloadUrl),
  installUpdateAndQuit: (installerPath) => ipcRenderer.invoke('helper:install-update-and-quit', installerPath)
});
