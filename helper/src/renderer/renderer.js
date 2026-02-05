const statusEl = document.getElementById('status');
const sessionInput = document.getElementById('sessionId');
const startBtn = document.getElementById('startBtn');
const allowUnattended = document.getElementById('allowUnattended');
const logEl = document.getElementById('log');

function log(message) {
  const line = document.createElement('div');
  line.textContent = message;
  logEl.appendChild(line);
}

async function init() {
  statusEl.textContent = 'Checking device registration...';
  const info = await window.helperApi.getInfo();
  log(`Device ID: ${info.deviceId}`);
  log(`Server: ${info.config.server}`);

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
  } else if (info.config.sessionId) {
    sessionInput.value = info.config.sessionId;
    statusEl.textContent = 'Ready to start.';
  } else {
    statusEl.textContent = 'Enter session ID.';
  }
}

startBtn.addEventListener('click', async () => {
  const sessionId = sessionInput.value.trim();
  if (!sessionId) {
    log('Session ID required.');
    return;
  }

  statusEl.textContent = 'Registering session...';
  try {
    await window.helperApi.registerSession({
      sessionId,
      allowUnattended: allowUnattended.checked
    });
    log('Session registered.');
  } catch (error) {
    log(`Register failed: ${error.message}`);
    statusEl.textContent = 'Registration failed.';
    return;
  }

  statusEl.textContent = 'Starting VNC...';
  const vnc = await window.helperApi.startVnc();
  if (vnc.started) {
    log('VNC started.');
  } else {
    log(vnc.message || 'VNC not started.');
  }

  statusEl.textContent = 'Waiting for technician...';
});

init();
