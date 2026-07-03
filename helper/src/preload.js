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
  getMonitors: () => ipcRenderer.invoke('helper:get-monitors'),

  // Socket.io signaling APIs
  socketConnect: (sessionId) => ipcRenderer.invoke('helper:socket-connect', sessionId),
  socketSendOffer: (data) => ipcRenderer.invoke('helper:socket-send-offer', data),
  socketSendIce: (data) => ipcRenderer.invoke('helper:socket-send-ice', data),
  socketEmit: (event, data) => ipcRenderer.invoke('helper:socket-emit', event, data),
  socketDisconnect: () => ipcRenderer.invoke('helper:socket-disconnect'),

  // Signaling event listeners
  onWebrtcAnswer: (callback) => {
    const h = (_event, data) => callback(data);
    ipcRenderer.on('signaling:webrtc-answer', h);
    return () => ipcRenderer.removeListener('signaling:webrtc-answer', h);
  },
  onWebrtcIceCandidate: (callback) => {
    const h = (_event, data) => callback(data);
    ipcRenderer.on('signaling:webrtc-ice-candidate', h);
    return () => ipcRenderer.removeListener('signaling:webrtc-ice-candidate', h);
  },
  onPeerJoined: (callback) => {
    const h = (_event, data) => callback(data);
    ipcRenderer.on('signaling:peer-joined', h);
    return () => ipcRenderer.removeListener('signaling:peer-joined', h);
  },
  onTechniciansPresent: (callback) => {
    const h = (_event, data) => callback(data);
    ipcRenderer.on('signaling:technicians-present', h);
    return () => ipcRenderer.removeListener('signaling:technicians-present', h);
  },
  onTechnicianJoined: (callback) => {
    const h = (_event, data) => callback(data);
    ipcRenderer.on('signaling:technician-joined', h);
    return () => ipcRenderer.removeListener('signaling:technician-joined', h);
  },
  onTechnicianLeft: (callback) => {
    const h = (_event, data) => callback(data);
    ipcRenderer.on('signaling:technician-left', h);
    return () => ipcRenderer.removeListener('signaling:technician-left', h);
  },
  onConnectionRequest: (callback) => {
    const h = (_event, data) => callback(data);
    ipcRenderer.on('signaling:connection-request', h);
    return () => ipcRenderer.removeListener('signaling:connection-request', h);
  },
  onPendingSession: (callback) => {
    const h = (_event, data) => callback(data);
    ipcRenderer.on('signaling:pending-session', h);
    return () => ipcRenderer.removeListener('signaling:pending-session', h);
  },

  // Auto-start on login
  getAutoStart: () => ipcRenderer.invoke('helper:get-auto-start'),
  setAutoStart: (enabled) => ipcRenderer.invoke('helper:set-auto-start', enabled),

  // Unattended-connections preference (persisted across reloads)
  getAllowUnattended: () => ipcRenderer.invoke('helper:get-allow-unattended'),
  setAllowUnattended: (enabled) => ipcRenderer.invoke('helper:set-allow-unattended', enabled),

  // Attended approval flow (technician requested while unattended is off)
  promptApproval: (info) => ipcRenderer.invoke('helper:prompt-approval', info),
  promptFileAccess: (info) => ipcRenderer.invoke('helper:prompt-file-access', info),
  declinePending: (sessionId) => ipcRenderer.invoke('helper:decline-pending', sessionId),
  onConnectionResponse: (callback) => {
    const h = (_event, data) => callback(data);
    ipcRenderer.on('signaling:connection-response', h);
    return () => ipcRenderer.removeListener('signaling:connection-response', h);
  },

  // Remote control APIs (for receiving technician input)
  onMouseEvent: (callback) => {
    const h = (_event, data) => callback(data);
    ipcRenderer.on('signaling:remote-mouse', h);
    return () => ipcRenderer.removeListener('signaling:remote-mouse', h);
  },
  onKeyboardEvent: (callback) => {
    const h = (_event, data) => callback(data);
    ipcRenderer.on('signaling:remote-keyboard', h);
    return () => ipcRenderer.removeListener('signaling:remote-keyboard', h);
  },

  // Technician requested monitor switch
  onSwitchMonitor: (callback) => {
    const h = (_event, data) => callback(data);
    ipcRenderer.on('signaling:switch-monitor', h);
    return () => ipcRenderer.removeListener('signaling:switch-monitor', h);
  },

  // Stream quality preset (optimize for quality vs speed)
  onSetStreamQuality: (callback) => {
    const h = (_event, data) => callback(data);
    ipcRenderer.on('signaling:set-stream-quality', h);
    return () => ipcRenderer.removeListener('signaling:set-stream-quality', h);
  },

  // Split view: technician enables/disables/points the second monitor feed
  onSetSplit: (callback) => {
    const h = (_event, data) => callback(data);
    ipcRenderer.on('signaling:set-split', h);
    return () => ipcRenderer.removeListener('signaling:set-split', h);
  },

  // Chat
  openChatWindow: () => ipcRenderer.invoke('helper:open-chat-window'),
  onChatMessage: (callback) => {
    const h = (_event, data) => callback(data);
    ipcRenderer.on('signaling:chat-message', h);
    return () => ipcRenderer.removeListener('signaling:chat-message', h);
  },

  // File transfer
  onFileAvailable: (callback) => {
    const h = (_event, data) => callback(data);
    ipcRenderer.on('signaling:file-available', h);
    return () => ipcRenderer.removeListener('signaling:file-available', h);
  },
  fileDownload: (url, defaultName) => ipcRenderer.invoke('helper:file-download', url, defaultName),
  filePickAndUpload: (sessionId, serverUrl) => ipcRenderer.invoke('helper:file-pick-upload', sessionId, serverUrl),

  // Download folder settings
  getDownloadSettings: () => ipcRenderer.invoke('helper:get-download-settings'),
  chooseDownloadDir: () => ipcRenderer.invoke('helper:choose-download-dir'),
  setAlwaysAskDownload: (v) => ipcRenderer.invoke('helper:set-always-ask-download', v),

  // Connection history
  appendConnectionLog: (entry) => ipcRenderer.invoke('helper:append-connection-log', entry),
  getConnectionLog: () => ipcRenderer.invoke('helper:get-connection-log'),
  clearConnectionLog: () => ipcRenderer.invoke('helper:clear-connection-log'),

  // "Being viewed" overlay
  overlaySet: (data) => ipcRenderer.invoke('helper:overlay-set', data),
  onOverlayEndSession: (callback) => {
    const h = () => callback();
    ipcRenderer.on('overlay:end-session', h);
    return () => ipcRenderer.removeListener('overlay:end-session', h);
  },

  // Update
  checkForUpdate: () => ipcRenderer.invoke('helper:check-for-update'),
  downloadUpdate: (downloadUrl) => ipcRenderer.invoke('helper:download-update', downloadUrl),
  installUpdateAndQuit: (installerPath) => ipcRenderer.invoke('helper:install-update-and-quit', installerPath),
  onUpdateDownloadProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('update-download-progress', handler);
    return () => ipcRenderer.removeListener('update-download-progress', handler);
  },

  createDesktopShortcut: () => ipcRenderer.invoke('helper:create-desktop-shortcut'),

  // Direct control injection via WebRTC data channel (bypasses Socket.io for lower latency)
  injectControl: (data) => ipcRenderer.send('control-message', data),

  // File System for P2P
  fsDrives: () => ipcRenderer.invoke('helper:fs-drives'),
  fsList: (path) => ipcRenderer.invoke('helper:fs-list', path),
  fsReadChunk: (path, offset, length) => ipcRenderer.invoke('helper:fs-read-chunk', path, offset, length),
  fsWriteChunk: (path, data, offset) => ipcRenderer.invoke('helper:fs-write-chunk', path, data, offset)
});
