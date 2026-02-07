const statusEl = document.getElementById('status');
const statusDot = document.getElementById('statusDot');
const sessionInput = document.getElementById('sessionId');
const sessionIdDisplay = document.getElementById('sessionIdDisplay');
const startBtn = document.getElementById('startBtn');
const allowUnattended = document.getElementById('allowUnattended');
const logEl = document.getElementById('log');
const fileNotificationEl = document.getElementById('fileNotification');
const fileNotificationText = document.getElementById('fileNotificationText');
const fileDownloadBtn = document.getElementById('fileDownloadBtn');
const detailsToggle = document.getElementById('detailsToggle');
const chatNotificationEl = document.getElementById('chatNotification');
const chatNotificationText = document.getElementById('chatNotificationText');
const chatOpenBtn = document.getElementById('chatOpenBtn');
const connectedTechniciansRow = document.getElementById('connectedTechniciansRow');
const connectedTechniciansList = document.getElementById('connectedTechniciansList');

let peerConnection = null;
let mediaStream = null;
let config = null;
let currentSessionId = null;
let isConnected = false;
let screenSources = [];
let receivedFiles = [];
let capabilities = { robotjs: false, platform: 'unknown' };
let logVisible = false;
let connectedTechnicians = [];

function updateConnectedTechniciansUI() {
  if (!connectedTechniciansRow || !connectedTechniciansList) return;
  if (connectedTechnicians.length === 0) {
    connectedTechniciansRow.style.display = 'none';
    connectedTechniciansList.innerHTML = '';
    return;
  }
  connectedTechniciansRow.style.display = 'flex';
  connectedTechniciansList.innerHTML = connectedTechnicians
    .map(t => {
      const name = (t.technicianName || 'Technician').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<span class="connected-technician-chip">${name}</span>`;
    })
    .join('');
}

function log(message) {
  const line = document.createElement('div');
  line.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
  console.log(message);
}

function setStatusUI(text, dotClass) {
  statusEl.textContent = text;
  statusDot.className = 'status-dot' + (dotClass ? ' ' + dotClass : '');
}

function showSessionId(id, editable) {
  if (editable) {
    sessionIdDisplay.style.display = 'none';
    sessionInput.style.display = '';
    sessionInput.readOnly = false;
    sessionInput.placeholder = 'ABC-123-XYZ';
  } else {
    sessionIdDisplay.textContent = id;
    sessionIdDisplay.style.display = '';
    sessionInput.style.display = 'none';
    sessionInput.value = id;
    sessionInput.readOnly = true;
  }
}

// Details toggle
detailsToggle.addEventListener('click', () => {
  logVisible = !logVisible;
  logEl.style.display = logVisible ? 'block' : 'none';
  detailsToggle.textContent = logVisible ? 'Hide details' : 'Show details';
});

// Chat notification + popup
function showChatNotification(msg) {
  if (chatNotificationText) chatNotificationText.textContent = `New message: "${msg.message}"`;
  if (chatNotificationEl) chatNotificationEl.style.display = 'flex';
}

chatOpenBtn.addEventListener('click', () => {
  window.helperApi.openChatWindow();
  if (chatNotificationEl) chatNotificationEl.style.display = 'none';
});

function showFileNotification() {
  if (receivedFiles.length === 0) {
    if (fileNotificationEl) fileNotificationEl.style.display = 'none';
    return;
  }
  const f = receivedFiles[receivedFiles.length - 1];
  if (fileNotificationText) fileNotificationText.textContent = `File: ${f.name}`;
  if (fileNotificationEl) fileNotificationEl.style.display = 'flex';
}

function setupFileDownloadBtn() {
  if (!fileDownloadBtn) return;
  fileDownloadBtn.onclick = async () => {
    if (receivedFiles.length === 0) return;
    const f = receivedFiles[receivedFiles.length - 1];
    const result = await window.helperApi.fileDownload(f.downloadUrl, f.name);
    if (result?.error) log(`Download failed: ${result.error}`);
    else if (!result?.canceled) log(`Saved`);
  };
}

async function init() {
  const version = await window.helperApi.getVersion();
  const versionEl = document.getElementById('helperVersion');
  if (versionEl) versionEl.textContent = `v${version}`;

  // Fetch capabilities early
  try {
    capabilities = await window.helperApi.getCapabilities();
    log(`Capabilities: robotjs=${capabilities.robotjs}, platform=${capabilities.platform}`);
    if (!capabilities.robotjs) {
      log('WARNING: Remote mouse/keyboard control is disabled (robotjs not loaded).');
      if (capabilities.platform === 'darwin') {
        log('Grant Accessibility permission: System Settings → Privacy & Security → Accessibility');
      }
    }
  } catch (e) {
    log(`Could not get capabilities: ${e.message}`);
  }

  setStatusUI('Getting session...', 'dot-amber');
  const info = await window.helperApi.getInfo();
  config = info.config;
  log(`Device ID: ${info.deviceId}`);
  log(`Server: ${config.server}`);

  let sessionReady = false;
  try {
    const assign = await window.helperApi.assignSession(allowUnattended.checked);
    currentSessionId = assign.sessionId;
    showSessionId(assign.sessionId, false);
    sessionReady = true;
    if (assign.existing) {
      log(`Using existing session: ${assign.sessionId}`);
    } else if (assign.fromPending) {
      log(`Using session from technician request: ${assign.sessionId}`);
    } else {
      log(`New session assigned: ${assign.sessionId}`);
    }
    setStatusUI('Ready', '');
  } catch (error) {
    log(`Could not get session: ${error.message}`);
    setStatusUI('Offline — enter session ID', 'dot-red');
    showSessionId('', true);
  }

  setupFileDownloadBtn();

  // Auto-start support if unattended mode is enabled and session is ready
  if (sessionReady && allowUnattended.checked) {
    log('Auto-starting (unattended mode)...');
    startBtn.click();
  }
}

async function startScreenCapture(overrideIndex) {
  if (screenSources.length === 0) {
    const sources = await window.helperApi.getSources();
    screenSources = sources.filter(s => s.name.includes('Screen') || s.name === 'Entire Screen');
    if (screenSources.length === 0) screenSources = sources;
  }
  const selectedIndex = overrideIndex != null ? overrideIndex : 0;
  const screenSource = screenSources[selectedIndex] || screenSources[0];
  if (!screenSource) {
    throw new Error('No screen source available');
  }
  try {
    log(`Using display ${selectedIndex + 1}`);
    const displayIndex = selectedIndex >= 0 ? selectedIndex : undefined;
    const displayInfo = await window.helperApi.getDisplayInfo(displayIndex);
    log(`Display: ${displayInfo.width}x${displayInfo.height}`);

    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: screenSource.id,
          maxWidth: displayInfo.width,
          maxHeight: displayInfo.height,
          maxFrameRate: 30
        }
      }
    });
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
    }
    mediaStream = newStream;
    log('Screen capture started');
    return mediaStream;
  } catch (error) {
    log(`Screen capture error: ${error.message}`);
    throw error;
  }
}

async function connectSignaling(sessionId) {
  log('Connecting to signaling server...');

  try {
    await window.helperApi.socketConnect(sessionId);
    log('Connected to signaling server');

    // Emit capabilities so technician sees them immediately
    window.helperApi.socketEmit('helper-capabilities', { sessionId, capabilities });

    window.helperApi.onFileAvailable((data) => {
      if (data.direction === 'technician-to-user' || !data.direction) {
        receivedFiles.push({
          id: data.id,
          name: data.original_name || data.originalName,
          downloadUrl: data.downloadUrl
        });
        showFileNotification();
        log(`File received`);
      }
    });

    window.helperApi.onSwitchMonitor(async (data) => {
      const idx = data.monitorIndex;
      if (typeof idx !== 'number' || idx < 0 || !peerConnection || !screenSources.length) return;
      if (idx >= screenSources.length) {
        log(`Monitor ${idx + 1} not available`);
        return;
      }
      log(`Switching to monitor ${idx + 1}...`);
      try {
        await startScreenCapture(idx);
        const videoTrack = mediaStream.getVideoTracks()[0];
        if (!videoTrack) return;
        const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          await sender.replaceTrack(videoTrack);
          log(`Switched to monitor ${idx + 1}`);
        }
      } catch (e) {
        log(`Switch monitor failed: ${e.message}`);
      }
    });

    window.helperApi.onSetStreamQuality(async (data) => {
      const quality = (data && data.quality) || 'balanced';
      if (!peerConnection) return;
      const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
      if (!sender) return;
      try {
        const params = await sender.getParameters();
        if (!params.encodings || !params.encodings.length) {
          params.encodings = [{}];
        }
        const enc = params.encodings[0];
        if (quality === 'speed') {
          enc.scaleResolutionDownBy = 2;
          enc.maxBitrate = 500000;
          enc.maxFramerate = 15;
        } else if (quality === 'quality') {
          enc.scaleResolutionDownBy = 1;
          enc.maxBitrate = 2500000;
          enc.maxFramerate = 30;
        } else {
          enc.scaleResolutionDownBy = 1.25;
          enc.maxBitrate = 1200000;
          enc.maxFramerate = 24;
        }
        await sender.setParameters(params);
        log(`Stream: ${quality}`);
      } catch (e) {
        log(`Set quality failed: ${e.message}`);
      }
    });

    // Set up event listeners for signaling
    window.helperApi.onWebrtcAnswer(async (data) => {
      log('Received WebRTC answer');
      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        log('Remote description set');
      } catch (error) {
        log(`Error setting remote description: ${error.message}`);
      }
    });

    window.helperApi.onWebrtcIceCandidate(async (data) => {
      log('Received ICE candidate');
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (error) {
        log(`Error adding ICE candidate: ${error.message}`);
      }
    });

    window.helperApi.onPeerJoined((data) => {
      log(`Peer joined: ${data.role}`);
    });

    connectedTechnicians = [];
    window.helperApi.onTechniciansPresent((data) => {
      if (data.technicians && Array.isArray(data.technicians)) {
        connectedTechnicians = data.technicians.slice();
        updateConnectedTechniciansUI();
      }
    });
    window.helperApi.onTechnicianJoined((data) => {
      const id = data.technicianId || data.socketId;
      if (id && !connectedTechnicians.some(t => t.technicianId === id)) {
        connectedTechnicians.push({ technicianId: id, technicianName: data.technicianName || 'Technician' });
        updateConnectedTechniciansUI();
      }
    });
    window.helperApi.onTechnicianLeft((data) => {
      const id = data.technicianId;
      if (id) {
        connectedTechnicians = connectedTechnicians.filter(t => t.technicianId !== id);
        updateConnectedTechniciansUI();
      }
    });

    // Chat messages from technician — show notification, auto-open chat window
    window.helperApi.onChatMessage((data) => {
      showChatNotification(data);
      window.helperApi.openChatWindow();
    });

    // Handle remote control events
    window.helperApi.onMouseEvent((data) => {
      console.log('Remote mouse event:', data);
    });

    window.helperApi.onKeyboardEvent((data) => {
      console.log('Remote keyboard event:', data);
    });

  } catch (error) {
    log(`Signaling connection error: ${error.message}`);
    throw error;
  }
}

async function createPeerConnection(sessionId) {
  log('Creating WebRTC peer connection...');

  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  peerConnection = new RTCPeerConnection(rtcConfig);

  // Add screen stream tracks
  mediaStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, mediaStream);
    log(`Added track: ${track.kind}`);
  });

  // Handle ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      log('Sending ICE candidate');
      // Explicitly serialize to plain object for IPC
      window.helperApi.socketSendIce({
        sessionId,
        candidate: {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex
        },
        role: 'helper'
      });
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    log(`ICE connection state: ${peerConnection.iceConnectionState}`);
    if (peerConnection.iceConnectionState === 'connected') {
      isConnected = true;
      setStatusUI('Connected', 'dot-green');
      startBtn.textContent = 'Disconnect';
      startBtn.classList.add('disconnect');
      startBtn.disabled = false;
    } else if (peerConnection.iceConnectionState === 'disconnected' || peerConnection.iceConnectionState === 'failed') {
      if (isConnected) {
        setDisconnected();
      }
      setStatusUI('Disconnected', 'dot-red');
    }
  };

  // Create and send offer
  log('Creating offer...');
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  log('Sending offer to technician...');
  // Explicitly serialize to plain object for IPC
  await window.helperApi.socketSendOffer({
    sessionId,
    offer: {
      type: peerConnection.localDescription.type,
      sdp: peerConnection.localDescription.sdp
    },
    role: 'helper'
  });

  return peerConnection;
}

function setDisconnected() {
  isConnected = false;
  connectedTechnicians = [];
  updateConnectedTechniciansUI();
  startBtn.textContent = 'Start Support';
  startBtn.classList.remove('disconnect');
  startBtn.disabled = false;
}

async function disconnect() {
  log('Disconnecting...');
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  await window.helperApi.socketDisconnect();
  connectedTechnicians = [];
  updateConnectedTechniciansUI();
  setDisconnected();
  setStatusUI('Ready', '');
  log('Disconnected');
}

startBtn.addEventListener('click', async () => {
  if (isConnected) {
    await disconnect();
    return;
  }

  const sessionId = (currentSessionId || sessionInput.value || '').trim();
  if (!sessionId) {
    log('Session ID required. Get one from the server or enter manually.');
    return;
  }

  currentSessionId = sessionId;
  startBtn.disabled = true;
  setStatusUI('Starting...', 'dot-amber');

  try {
    setStatusUI('Registering...', 'dot-amber');
    await window.helperApi.registerSession({
      sessionId,
      allowUnattended: allowUnattended.checked,
      capabilities
    });
    log('Session registered.');

    setStatusUI('Capturing screen...', 'dot-amber');
    await startScreenCapture();

    setStatusUI('Connecting...', 'dot-amber');
    await connectSignaling(sessionId);

    setStatusUI('Waiting for technician...', 'dot-amber');
    await createPeerConnection(sessionId);

    log('Ready - waiting for technician to connect');
  } catch (error) {
    log(`Error: ${error.message}`);
    setStatusUI('Connection failed', 'dot-red');
    startBtn.disabled = false;
  }
});

init();
