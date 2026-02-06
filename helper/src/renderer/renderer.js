const statusEl = document.getElementById('status');
const sessionInput = document.getElementById('sessionId');
const startBtn = document.getElementById('startBtn');
const allowUnattended = document.getElementById('allowUnattended');
const logEl = document.getElementById('log');

let socket = null;
let peerConnection = null;
let mediaStream = null;
let config = null;

function log(message) {
  const line = document.createElement('div');
  line.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
  console.log(message);
}

async function init() {
  statusEl.textContent = 'Checking device registration...';
  const info = await window.helperApi.getInfo();
  config = info.config;
  log(`Device ID: ${info.deviceId}`);
  log(`Server: ${config.server}`);

  try {
    await window.helperApi.registerDevice(allowUnattended.checked);
    log('Device registered.');
  } catch (error) {
    log(`Device registration failed: ${error.message}`);
  }

  const pending = await window.helperApi.checkPending();
  if (pending.pending && pending.sessionId) {
    sessionInput.value = pending.sessionId;
    statusEl.textContent = 'Pending session detected.';
    log(`Pending session: ${pending.sessionId}`);
  } else if (config.sessionId) {
    sessionInput.value = config.sessionId;
    statusEl.textContent = 'Ready to start.';
  } else {
    statusEl.textContent = 'Enter session ID.';
  }
}

async function startScreenCapture() {
  try {
    log('Getting screen sources...');
    const sources = await window.helperApi.getSources();

    if (sources.length === 0) {
      throw new Error('No screen sources available');
    }

    // Use the first screen source (primary display)
    const screenSource = sources.find(s => s.name === 'Entire Screen' || s.name.includes('Screen')) || sources[0];
    log(`Using source: ${screenSource.name}`);

    const displayInfo = await window.helperApi.getDisplayInfo();
    log(`Display: ${displayInfo.width}x${displayInfo.height}`);

    // Get screen stream using getUserMedia with chromeMediaSource
    mediaStream = await navigator.mediaDevices.getUserMedia({
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

    log('Screen capture started');
    return mediaStream;
  } catch (error) {
    log(`Screen capture error: ${error.message}`);
    throw error;
  }
}

function connectSignaling(sessionId) {
  return new Promise((resolve, reject) => {
    log('Connecting to signaling server...');

    // Load Socket.io from server
    const script = document.createElement('script');
    script.src = `${config.server}/socket.io/socket.io.js`;
    script.onload = () => {
      socket = io(config.server, {
        transports: ['websocket', 'polling'],
        rejectUnauthorized: false
      });

      socket.on('connect', () => {
        log('Connected to signaling server');
        socket.emit('join-session', { sessionId, role: 'helper' });
        resolve(socket);
      });

      socket.on('connect_error', (error) => {
        log(`Signaling connection error: ${error.message}`);
        reject(error);
      });

      // Handle WebRTC signaling
      socket.on('webrtc-answer', async (data) => {
        log('Received WebRTC answer');
        try {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
          log('Remote description set');
        } catch (error) {
          log(`Error setting remote description: ${error.message}`);
        }
      });

      socket.on('webrtc-ice-candidate', async (data) => {
        log('Received ICE candidate');
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (error) {
          log(`Error adding ICE candidate: ${error.message}`);
        }
      });

      // Handle remote control events
      socket.on('remote-mouse', (data) => {
        // Will be handled by robotjs in production
        console.log('Remote mouse event:', data);
      });

      socket.on('remote-keyboard', (data) => {
        // Will be handled by robotjs in production
        console.log('Remote keyboard event:', data);
      });
    };

    script.onerror = () => {
      reject(new Error('Failed to load Socket.io'));
    };

    document.head.appendChild(script);
  });
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
      socket.emit('webrtc-ice-candidate', {
        sessionId,
        candidate: event.candidate,
        role: 'helper'
      });
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    log(`ICE connection state: ${peerConnection.iceConnectionState}`);
    if (peerConnection.iceConnectionState === 'connected') {
      statusEl.textContent = 'Connected - Technician viewing screen';
    } else if (peerConnection.iceConnectionState === 'disconnected') {
      statusEl.textContent = 'Disconnected';
    }
  };

  // Create and send offer
  log('Creating offer...');
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  log('Sending offer to technician...');
  socket.emit('webrtc-offer', {
    sessionId,
    offer: peerConnection.localDescription,
    role: 'helper'
  });

  return peerConnection;
}

startBtn.addEventListener('click', async () => {
  const sessionId = sessionInput.value.trim();
  if (!sessionId) {
    log('Session ID required.');
    return;
  }

  startBtn.disabled = true;
  statusEl.textContent = 'Starting...';

  try {
    // Register session with server
    statusEl.textContent = 'Registering session...';
    await window.helperApi.registerSession({
      sessionId,
      allowUnattended: allowUnattended.checked
    });
    log('Session registered.');

    // Start screen capture
    statusEl.textContent = 'Starting screen capture...';
    await startScreenCapture();

    // Connect to signaling server
    statusEl.textContent = 'Connecting to server...';
    await connectSignaling(sessionId);

    // Create WebRTC peer connection and send offer
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
