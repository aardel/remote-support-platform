const statusEl = document.getElementById('status');
const sessionInput = document.getElementById('sessionId');
const startBtn = document.getElementById('startBtn');
const allowUnattended = document.getElementById('allowUnattended');
const monitorSelect = document.getElementById('monitorSelect');
const logEl = document.getElementById('log');

let peerConnection = null;
let mediaStream = null;
let config = null;
let currentSessionId = null;
let isConnected = false;
let screenSources = [];
let receivedFiles = [];

function log(message) {
  const line = document.createElement('div');
  line.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
  console.log(message);
}

function renderReceivedFiles() {
  const el = document.getElementById('receivedFiles');
  if (!el) return;
  el.innerHTML = receivedFiles.length === 0
    ? '<span class="no-files">No files received</span>'
    : receivedFiles.map((f) => `
        <div class="received-file-item">
          <span class="received-file-name">${escapeHtml(f.name)}</span>
          <button type="button" class="download-file-btn" data-url="${escapeHtml(f.downloadUrl)}" data-name="${escapeHtml(f.name)}">Download</button>
        </div>
      `).join('');
  el.querySelectorAll('.download-file-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const result = await window.helperApi.fileDownload(btn.dataset.url, btn.dataset.name);
      if (result?.error) log(`Download failed: ${result.error}`);
      else if (!result?.canceled) log(`Saved: ${result.filePath}`);
    });
  });
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s || '';
  return div.innerHTML;
}

async function init() {
  statusEl.textContent = 'Getting session from server...';
  const info = await window.helperApi.getInfo();
  config = info.config;
  log(`Device ID: ${info.deviceId}`);
  log(`Server: ${config.server}`);

  try {
    const assign = await window.helperApi.assignSession(allowUnattended.checked);
    currentSessionId = assign.sessionId;
    sessionInput.value = assign.sessionId;
    sessionInput.readOnly = true;
    sessionInput.title = 'Assigned by server (same device always gets the same session)';
    if (assign.existing) {
      log(`Using existing session: ${assign.sessionId}`);
      statusEl.textContent = 'Session ready (same device).';
    } else if (assign.fromPending) {
      log(`Using session from technician request: ${assign.sessionId}`);
      statusEl.textContent = 'Session ready (technician requested).';
    } else {
      log(`New session assigned: ${assign.sessionId}`);
      statusEl.textContent = 'Session ready. Click Start Support.';
    }
  } catch (error) {
    log(`Could not get session: ${error.message}`);
    statusEl.textContent = 'Enter session ID manually (offline?).';
    sessionInput.readOnly = false;
    sessionInput.placeholder = 'ABC-123-XYZ';
  }

  await loadMonitorOptions();
  renderReceivedFiles();
  document.getElementById('sendFileBtn').addEventListener('click', async () => {
    const sid = currentSessionId || sessionInput.value.trim();
    if (!sid) {
      log('Start a session first to send files.');
      return;
    }
    const result = await window.helperApi.filePickAndUpload(sid, config?.server);
    if (result?.error) log(`Upload failed: ${result.error}`);
    else if (!result?.canceled && result?.success) log('File sent to technician.');
  });
}

async function loadMonitorOptions() {
  try {
    const sources = await window.helperApi.getSources();
    screenSources = sources.filter(s => s.name.includes('Screen') || s.name === 'Entire Screen');
    const displays = await window.helperApi.getAllDisplays();
    monitorSelect.innerHTML = '';
    if (screenSources.length === 0) {
      monitorSelect.innerHTML = '<option value="">No screen source</option>';
      return;
    }
    screenSources.forEach((src, i) => {
      const disp = displays[i];
      const label = disp ? `${src.name} (${disp.width}×${disp.height})` : src.name;
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = label;
      monitorSelect.appendChild(opt);
    });
    monitorSelect.value = '0';
    if (screenSources.length === 1) {
      document.getElementById('monitorLabel').style.display = 'none';
      monitorSelect.style.display = 'none';
    }
  } catch (e) {
    log(`Monitor list: ${e.message}`);
    monitorSelect.innerHTML = '<option value="0">Screen</option>';
    screenSources = await window.helperApi.getSources();
    if (screenSources.length === 0) screenSources = await window.helperApi.getSources();
  }
}

async function startScreenCapture(overrideIndex) {
  const selectedIndex = overrideIndex != null
    ? overrideIndex
    : parseInt(monitorSelect.value, 10);
  const screenSource = screenSources[selectedIndex] || screenSources[0];
  if (!screenSource) {
    throw new Error('No screen source selected');
  }
  try {
    log(`Using source: ${screenSource.name}`);
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

    window.helperApi.onFileAvailable((data) => {
      if (data.direction === 'technician-to-user' || !data.direction) {
        receivedFiles.push({
          id: data.id,
          name: data.original_name || data.originalName,
          downloadUrl: data.downloadUrl
        });
        renderReceivedFiles();
        log(`File received: ${data.original_name || data.originalName}`);
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
      statusEl.textContent = 'Connected - Technician viewing screen';
      startBtn.textContent = 'Disconnect';
      startBtn.classList.add('disconnect');
      startBtn.disabled = false;
      monitorSelect.disabled = true;
    } else if (peerConnection.iceConnectionState === 'disconnected' || peerConnection.iceConnectionState === 'failed') {
      if (isConnected) {
        setDisconnected();
      }
      statusEl.textContent = 'Disconnected';
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
  startBtn.textContent = 'Start Support';
  startBtn.classList.remove('disconnect');
  startBtn.disabled = false;
  if (monitorSelect) monitorSelect.disabled = false;
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
  setDisconnected();
  statusEl.textContent = 'Session ready. Click Start Support.';
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
  statusEl.textContent = 'Starting...';

  try {
    statusEl.textContent = 'Registering session...';
    await window.helperApi.registerSession({
      sessionId,
      allowUnattended: allowUnattended.checked
    });
    log('Session registered.');

    statusEl.textContent = 'Starting screen capture...';
    await startScreenCapture();

    statusEl.textContent = 'Connecting to server...';
    await connectSignaling(sessionId);

    statusEl.textContent = 'Waiting for technician...';
    await createPeerConnection(sessionId);

    log('Ready - waiting for technician to connect');
  } catch (error) {
    log(`Error: ${error.message}`);
    statusEl.textContent = 'Connection failed';
    startBtn.disabled = false;
  }
});

init();
