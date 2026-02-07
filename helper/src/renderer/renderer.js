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
const updateBanner = document.getElementById('updateBanner');
const updateLatestVersion = document.getElementById('updateLatestVersion');
const updateNowBtn = document.getElementById('updateNowBtn');
const updateNextSessionBtn = document.getElementById('updateNextSessionBtn');
const updateProgress = document.getElementById('updateProgress');

let peerConnection = null;
let updateInfo = null; // { updateAvailable, latestVersion, downloadUrl } // kept for switch-monitor/set-stream-quality (first PC or any)
const peerConnectionsBySocketId = new Map(); // technicianSocketId -> RTCPeerConnection (multi-viewer)
let mediaStream = null;
let config = null;
let currentSessionId = null;
let isConnected = false;
let screenSources = [];
let receivedFiles = [];
let capabilities = { robotjs: false, platform: 'unknown' };
let logVisible = false;
let connectedTechnicians = [];
let connectedSince = null; // Date when first technician connected
let connectedTimer = null; // interval for updating connected duration

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

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function startConnectedTimer() {
  connectedSince = Date.now();
  stopConnectedTimer();
  connectedTimer = setInterval(() => {
    if (connectedSince && isConnected) {
      setStatusUI(`Connected ${formatDuration(Date.now() - connectedSince)}`, 'dot-green');
    }
  }, 1000);
}

function stopConnectedTimer() {
  if (connectedTimer) { clearInterval(connectedTimer); connectedTimer = null; }
  connectedSince = null;
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
    if (capabilities.platform === 'darwin') {
      const macHint = document.getElementById('helperMacHint');
      if (macHint) { macHint.style.display = ''; }
    }
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

  // Check for helper update (after we have config)
  checkForUpdateAndShowBanner();

  // Auto-start support if unattended mode is enabled and session is ready
  if (sessionReady && allowUnattended.checked) {
    log('Auto-starting (unattended mode)...');
    startBtn.click();
  }
}

async function checkForUpdateAndShowBanner() {
  if (!updateBanner || !config?.server) return;
  try {
    const result = await window.helperApi.checkForUpdate();
    if (result?.updateAvailable && result?.latestVersion && result?.downloadUrl) {
      updateInfo = result;
      if (updateLatestVersion) updateLatestVersion.textContent = result.latestVersion;
      updateBanner.style.display = 'block';
      if (updateNowBtn) updateNowBtn.onclick = handleUpgradeNow;
      if (updateNextSessionBtn) updateNextSessionBtn.onclick = () => { updateBanner.style.display = 'none'; };
    }
  } catch (e) {
    log(`Update check: ${e.message}`);
  }
}

async function handleUpgradeNow() {
  if (!updateInfo?.downloadUrl || !updateNowBtn || !updateProgress) return;
  updateNowBtn.disabled = true;
  if (updateNextSessionBtn) updateNextSessionBtn.disabled = true;
  updateProgress.style.display = 'block';
  updateProgress.textContent = 'Downloading...';
  try {
    const installerPath = await window.helperApi.downloadUpdate(updateInfo.downloadUrl);
    updateProgress.textContent = 'Opening installer...';
    await window.helperApi.installUpdateAndQuit(installerPath);
  } catch (e) {
    log(`Update failed: ${e.message}`);
    updateProgress.textContent = `Failed: ${e.message}`;
    updateNowBtn.disabled = false;
    if (updateNextSessionBtn) updateNextSessionBtn.disabled = false;
  }
}

async function startScreenCapture(overrideIndex) {
  if (screenSources.length === 0) {
    const sources = await window.helperApi.getSources();
    screenSources = sources;
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
          minWidth: displayInfo.width,
          minHeight: displayInfo.height,
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
    // Tell WebRTC encoder this is screen content — prioritize sharpness over smooth motion
    mediaStream.getVideoTracks().forEach(track => {
      if ('contentHint' in track) {
        track.contentHint = 'detail';
      }
    });
    log('Screen capture started');
    return mediaStream;
  } catch (error) {
    log(`Screen capture error: ${error.message}`);
    if (capabilities.platform === 'darwin') {
      log('On macOS: grant Screen Recording permission — System Settings → Privacy & Security → Screen Recording → enable for this app, then try again.');
    }
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
      if (typeof idx !== 'number' || idx < 0 || !screenSources.length) return;
      if (idx >= screenSources.length) {
        log(`Monitor ${idx + 1} not available`);
        return;
      }
      log(`Switching to monitor ${idx + 1}...`);
      try {
        await startScreenCapture(idx);
        const videoTrack = mediaStream.getVideoTracks()[0];
        if (!videoTrack) return;
        const pcs = peerConnectionsBySocketId.size ? Array.from(peerConnectionsBySocketId.values()) : (peerConnection ? [peerConnection] : []);
        for (const pc of pcs) {
          const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) await sender.replaceTrack(videoTrack);
        }
        log(`Switched to monitor ${idx + 1}`);
      } catch (e) {
        log(`Switch monitor failed: ${e.message}`);
      }
    });

    window.helperApi.onSetStreamQuality(async (data) => {
      const quality = (data && data.quality) || 'balanced';
      const pcs = peerConnectionsBySocketId.size ? Array.from(peerConnectionsBySocketId.values()) : (peerConnection ? [peerConnection] : []);
      for (const pc of pcs) {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (!sender) continue;
        try {
          const params = await sender.getParameters();
          if (!params.encodings || !params.encodings.length) params.encodings = [{}];
          const enc = params.encodings[0];
          if (quality === 'speed') {
            enc.scaleResolutionDownBy = 2;
            enc.maxBitrate = 2000000;
            enc.maxFramerate = 15;
            params.degradationPreference = 'balanced';
          } else if (quality === 'quality') {
            enc.scaleResolutionDownBy = 1;
            enc.maxBitrate = 16000000;
            enc.maxFramerate = 24;
            enc.priority = 'high';
            enc.networkPriority = 'high';
            params.degradationPreference = 'maintain-resolution';
          } else {
            enc.scaleResolutionDownBy = 1;
            enc.maxBitrate = 6000000;
            enc.maxFramerate = 24;
            params.degradationPreference = 'maintain-resolution';
          }
          await sender.setParameters(params);
        } catch (e) {
          log(`Set quality failed: ${e.message}`);
        }
      }
      log(`Stream: ${quality}`);
    });

    // Set up event listeners for signaling (multi-viewer: route by data.from)
    window.helperApi.onWebrtcAnswer(async (data) => {
      const pc = data.from ? peerConnectionsBySocketId.get(data.from) : peerConnection;
      if (!pc) {
        log('Received WebRTC answer but no PC for this technician');
        return;
      }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        log('Remote description set');
      } catch (error) {
        log(`Error setting remote description: ${error.message}`);
      }
    });

    window.helperApi.onWebrtcIceCandidate(async (data) => {
      const pc = (data.role === 'technician' && data.from) ? peerConnectionsBySocketId.get(data.from) : peerConnection;
      if (!pc) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
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
        data.technicians.forEach(t => {
          if (t.technicianSocketId && !peerConnectionsBySocketId.has(t.technicianSocketId)) {
            createPeerConnectionForTechnician(sessionId, t.technicianSocketId);
          }
        });
      }
    });
    window.helperApi.onTechnicianJoined((data) => {
      const id = data.technicianId || data.socketId;
      if (id && !connectedTechnicians.some(t => t.technicianId === id)) {
        connectedTechnicians.push({ technicianId: id, technicianName: data.technicianName || 'Technician' });
        updateConnectedTechniciansUI();
      }
      const socketId = data.technicianSocketId;
      if (socketId && !peerConnectionsBySocketId.has(socketId)) {
        createPeerConnectionForTechnician(sessionId, socketId);
      }
    });
    window.helperApi.onTechnicianLeft((data) => {
      const id = data.technicianId;
      if (id) {
        connectedTechnicians = connectedTechnicians.filter(t => t.technicianId !== id);
        updateConnectedTechniciansUI();
      }
      const socketId = data.technicianSocketId;
      if (socketId) {
        const pc = peerConnectionsBySocketId.get(socketId);
        if (pc) {
          pc.close();
          peerConnectionsBySocketId.delete(socketId);
          if (peerConnection === pc) peerConnection = peerConnectionsBySocketId.values().next().value || null;
        }
      }
      // If no technicians remain, handle gracefully (stay ready if unattended)
      if (connectedTechnicians.length === 0 && peerConnectionsBySocketId.size === 0) {
        handleAllTechniciansGone();
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

// Boost SDP bitrate so the encoder starts high and doesn't ramp up slowly
function boostSdpBitrate(sdp) {
  // Set b=AS (application-specific) bitrate for video to 16 Mbps
  // Also inject x-google-min/start-bitrate so Chrome/Electron doesn't start at 300kbps
  const lines = sdp.split('\r\n');
  const out = [];
  let inVideo = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('m=video')) {
      inVideo = true;
      out.push(line);
      continue;
    }
    if (line.startsWith('m=') && !line.startsWith('m=video')) {
      inVideo = false;
    }
    // Remove existing b=AS for video (we'll add our own)
    if (inVideo && line.startsWith('b=AS:')) continue;
    out.push(line);
    // After c= line in video section, insert our bitrate
    if (inVideo && line.startsWith('c=')) {
      out.push('b=AS:16000');
    }
    // After each a=fmtp line in video, add google bitrate hints
    if (inVideo && line.startsWith('a=fmtp:') && !line.includes('x-google-min-bitrate')) {
      const idx = line.indexOf(' ');
      if (idx > 0) {
        out[out.length - 1] = line + ';x-google-min-bitrate=4000;x-google-start-bitrate=8000;x-google-max-bitrate=16000';
      }
    }
  }
  return out.join('\r\n');
}

// Prefer VP9 (sharper for screen) over VP8; fall back to H264 if available
function preferScreenCodecs(pc) {
  try {
    const transceivers = pc.getTransceivers();
    for (const t of transceivers) {
      if (t.sender && t.sender.track && t.sender.track.kind === 'video') {
        if (typeof RTCRtpSender.getCapabilities === 'function') {
          const caps = RTCRtpSender.getCapabilities('video');
          if (caps && caps.codecs) {
            const vp9 = caps.codecs.filter(c => c.mimeType === 'video/VP9');
            const h264 = caps.codecs.filter(c => c.mimeType === 'video/H264');
            const vp8 = caps.codecs.filter(c => c.mimeType === 'video/VP8');
            const rest = caps.codecs.filter(c => c.mimeType !== 'video/VP9' && c.mimeType !== 'video/H264' && c.mimeType !== 'video/VP8');
            const ordered = [...vp9, ...h264, ...vp8, ...rest];
            if (typeof t.setCodecPreferences === 'function') {
              t.setCodecPreferences(ordered);
            }
          }
        }
      }
    }
  } catch (e) {
    // setCodecPreferences not supported in all Electron versions; SDP fallback is fine
  }
}

// Apply initial encoding params so stream starts sharp (not waiting for technician to set quality)
async function applyInitialQuality(pc) {
  const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
  if (!sender) return;
  try {
    const params = await sender.getParameters();
    if (!params.encodings || !params.encodings.length) params.encodings = [{}];
    const enc = params.encodings[0];
    enc.scaleResolutionDownBy = 1;
    enc.maxBitrate = 16000000;
    enc.maxFramerate = 24;
    enc.priority = 'high';
    enc.networkPriority = 'high';
    // CRITICAL: never reduce resolution under pressure — drop frames instead
    params.degradationPreference = 'maintain-resolution';
    await sender.setParameters(params);
  } catch (_) { /* some implementations reject before connection */ }
}

async function createPeerConnectionForTechnician(sessionId, targetSocketId) {
  if (!mediaStream) return;
  log(`Creating WebRTC peer connection for technician ${targetSocketId}...`);

  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  const pc = new RTCPeerConnection(rtcConfig);
  peerConnectionsBySocketId.set(targetSocketId, pc);
  if (!peerConnection) peerConnection = pc;

  mediaStream.getTracks().forEach(track => {
    pc.addTrack(track, mediaStream);
  });

  preferScreenCodecs(pc);
  applyInitialQuality(pc);

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      window.helperApi.socketSendIce({
        sessionId,
        candidate: {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex
        },
        role: 'helper',
        targetSocketId
      });
    }
  };

  pc.oniceconnectionstatechange = () => {
    const anyConnected = Array.from(peerConnectionsBySocketId.values()).some(p => p.iceConnectionState === 'connected');
    if (anyConnected) {
      if (!isConnected) startConnectedTimer();
      isConnected = true;
      startBtn.textContent = 'Disconnect';
      startBtn.classList.add('disconnect');
      startBtn.disabled = false;
    } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
      const stillAny = Array.from(peerConnectionsBySocketId.values()).some(p => p.iceConnectionState === 'connected');
      if (!stillAny) handleAllTechniciansGone();
    }
  };

  const offer = await pc.createOffer();
  // Boost SDP bitrate before setting local description
  const boostedOffer = new RTCSessionDescription({
    type: offer.type,
    sdp: boostSdpBitrate(offer.sdp)
  });
  await pc.setLocalDescription(boostedOffer);

  await window.helperApi.socketSendOffer({
    sessionId,
    offer: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
    role: 'helper',
    targetSocketId
  });
  log(`Offer sent to technician ${targetSocketId}`);
  return pc;
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

  mediaStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, mediaStream);
    log(`Added track: ${track.kind}`);
  });

  preferScreenCodecs(peerConnection);
  applyInitialQuality(peerConnection);

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
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
      if (!isConnected) startConnectedTimer();
      isConnected = true;
      startBtn.textContent = 'Disconnect';
      startBtn.classList.add('disconnect');
      startBtn.disabled = false;
    } else if (peerConnection.iceConnectionState === 'disconnected' || peerConnection.iceConnectionState === 'failed') {
      handleAllTechniciansGone();
    }
  };

  const offer = await peerConnection.createOffer();
  const boostedOffer = new RTCSessionDescription({
    type: offer.type,
    sdp: boostSdpBitrate(offer.sdp)
  });
  await peerConnection.setLocalDescription(boostedOffer);

  await window.helperApi.socketSendOffer({
    sessionId,
    offer: { type: peerConnection.localDescription.type, sdp: peerConnection.localDescription.sdp },
    role: 'helper'
  });
  return peerConnection;
}

function setDisconnected() {
  isConnected = false;
  stopConnectedTimer();
  connectedTechnicians = [];
  updateConnectedTechniciansUI();
  startBtn.textContent = 'Start Support';
  startBtn.classList.remove('disconnect');
  startBtn.disabled = false;
}

// When all technicians leave but unattended mode is on: stay ready for the next connection
function handleAllTechniciansGone() {
  stopConnectedTimer();
  isConnected = false;
  connectedTechnicians = [];
  updateConnectedTechniciansUI();
  // Clean up dead peer connections but keep signaling + screen capture alive
  peerConnectionsBySocketId.forEach(pc => pc.close());
  peerConnectionsBySocketId.clear();
  peerConnection = null;
  if (allowUnattended.checked && mediaStream) {
    setStatusUI('Waiting for technician...', 'dot-amber');
    startBtn.textContent = 'Disconnect';
    startBtn.classList.add('disconnect');
    startBtn.disabled = false;
    log('Technician disconnected. Waiting for next connection (unattended mode).');
  } else {
    setDisconnected();
  }
}

async function disconnect() {
  log('Disconnecting...');
  stopConnectedTimer();
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  peerConnectionsBySocketId.forEach(pc => pc.close());
  peerConnectionsBySocketId.clear();
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

    log('Ready - when a technician connects they will receive the stream');
  } catch (error) {
    log(`Error: ${error.message}`);
    const isMacCapture = capabilities.platform === 'darwin' && (error.message || '').toLowerCase().includes('video source');
    const statusMsg = isMacCapture
      ? 'Connection failed — grant Screen Recording in System Settings → Privacy & Security → Screen Recording'
      : 'Connection failed';
    setStatusUI(statusMsg, 'dot-red');
    startBtn.disabled = false;
  }
});

init();
