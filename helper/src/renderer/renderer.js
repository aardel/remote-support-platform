const statusEl = document.getElementById('status');
const statusDot = document.getElementById('statusDot');
const sessionInput = document.getElementById('sessionId');
const sessionIdDisplay = document.getElementById('sessionIdDisplay');
const supportCodeDisplay = document.getElementById('supportCodeDisplay');
const copyCodeBtn = document.getElementById('copyCodeBtn');
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
const updateProgressWrap = document.getElementById('updateProgressWrap');
const updateProgressBarFill = document.getElementById('updateProgressBarFill');
const updateProgressText = document.getElementById('updateProgressText');
const checkUpdateBtn = document.getElementById('checkUpdateBtn');
const createShortcutBtn = document.getElementById('createShortcutBtn');
const shortcutMessage = document.getElementById('shortcutMessage');

let peerConnection = null;
let updateInfo = null; // { updateAvailable, latestVersion, downloadUrl } // kept for switch-monitor/set-stream-quality (first PC or any)
const peerConnectionsBySocketId = new Map(); // technicianSocketId -> RTCPeerConnection (multi-viewer)
let mediaStream = null;         // main-pane capture (getUserMedia stream)
let secondaryStream = null;     // second-pane capture (only while split is on)
let config = null;
let currentSessionId = null;
let isConnected = false;
let screenSources = [];
let receivedFiles = [];

// Multi-monitor / split-view state
let monitors = [];              // unified monitor list from the main process
let mainMonitorIndex = 0;       // which monitor the main pane shows
let secondMonitorIndex = 1;     // which monitor the second (split) pane shows
let splitEnabled = false;       // is the technician viewing two monitors at once
// Stable stream containers: their .id is the msid we advertise to the viewer so
// it can tell the main feed from the second feed. Track content is swapped via
// replaceTrack, so these ids stay constant across monitor switches (no
// renegotiation needed).
const mainMs = new MediaStream();
const secondMs = new MediaStream();

// Periodic update check
let updateCheckTimer = null;
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // re-check every 4 hours

// ICE servers (STUN + TURN). Fetched from the server so TURN relay credentials
// stay current; falls back to public STUN if the fetch fails (graceful — a
// missing/unreachable TURN just means direct/STUN-only, as before).
let iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];
async function loadIceServers() {
  try {
    if (!config || !config.server) return;
    const res = await fetch(`${config.server}/api/turn-servers`);
    if (!res.ok) return;
    const j = await res.json();
    if (Array.isArray(j.servers) && j.servers.length) {
      iceServers = j.servers;
      const hasTurn = iceServers.some(s => String(s.urls || '').startsWith('turn'));
      log(`ICE servers loaded (${iceServers.length}${hasTurn ? ', TURN available' : ', STUN only'})`);
    }
  } catch (e) { log(`ICE servers fetch failed: ${e.message}`); }
}

// Attended-mode consent gating: technicians the customer approved this session.
const approvedTechnicians = new Set();   // technician socketIds
const approvalPending = new Set();        // dialogs currently open, by socketId
let approvalChain = Promise.resolve();    // serialize native dialogs

// Unattended auto-off: turning it on grants access for at most 1 hour of idle
// time, then it flips back off automatically (for safety).
let unattendedOnSince = 0;
let unattendedTimerInterval = null;
const UNATTENDED_MAX_MS = 60 * 60 * 1000; // 1 hour
const unattendedTimerEl = document.getElementById('unattendedTimer');
let capabilities = { robotjs: false, platform: 'unknown' };
let logVisible = false;
let connectedTechnicians = [];
let connectedSince = null; // Date when first technician connected
let connectedTimer = null; // interval for updating connected duration
let disconnecting = false;
let signalingUnsubscribers = [];

function clearSignalingListeners() {
  for (const fn of signalingUnsubscribers) {
    try { fn(); } catch (_) { }
  }
  signalingUnsubscribers = [];
}

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
  stopConnectedTimer();
  connectedSince = Date.now();
  beginConnectionLog();
  setStatusUI('Connected 0:00', 'dot-green');
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

/* ---------- "Being viewed" overlay ---------- */
function updateOverlay(visible) {
  if (!window.helperApi.overlaySet) return;
  window.helperApi.overlaySet({ visible, technician: connectedTechNames().join(', ') }).catch(() => {});
}

/* ---------- Connection history log ---------- */
let currentLogEntry = null;
function connectedTechNames() {
  return connectedTechnicians.map(t => t.technicianName).filter(Boolean);
}
function beginConnectionLog() {
  if (currentLogEntry) return;
  currentLogEntry = { start: Date.now(), technicians: connectedTechNames(), sessionId: currentSessionId };
  updateOverlay(true);
}
function endConnectionLog() {
  if (!currentLogEntry) return;
  const names = Array.from(new Set([...(currentLogEntry.technicians || []), ...connectedTechNames()]));
  const entry = {
    start: currentLogEntry.start,
    end: Date.now(),
    durationMs: Date.now() - currentLogEntry.start,
    technician: names.join(', ') || 'Technician',
    sessionId: currentLogEntry.sessionId || currentSessionId
  };
  currentLogEntry = null;
  updateOverlay(false);
  if (window.helperApi.appendConnectionLog) {
    window.helperApi.appendConnectionLog(entry).then(() => renderConnectionLog()).catch(() => {});
  }
}

function setupConnLog() {
  const toggle = document.getElementById('connLogToggle');
  const listEl = document.getElementById('connLogList');
  const clearBtn = document.getElementById('connLogClear');
  if (!toggle || !listEl) return;
  toggle.onclick = () => {
    const show = listEl.style.display === 'none';
    listEl.style.display = show ? 'block' : 'none';
    if (clearBtn) clearBtn.style.display = show ? '' : 'none';
    toggle.textContent = show ? 'Hide history' : 'Connection history';
    if (show) renderConnectionLog();
  };
  if (clearBtn) clearBtn.onclick = async () => {
    try { await window.helperApi.clearConnectionLog(); } catch (_) {}
    renderConnectionLog();
  };
}

async function renderConnectionLog() {
  const listEl = document.getElementById('connLogList');
  if (!listEl || !window.helperApi.getConnectionLog) return;
  let entries = [];
  try { entries = await window.helperApi.getConnectionLog(); } catch (_) {}
  if (!entries.length) {
    listEl.innerHTML = '<div class="conn-log-empty">No connections yet.</div>';
    return;
  }
  listEl.innerHTML = entries.slice(0, 50).map(e => {
    const when = new Date(e.start).toLocaleString();
    const dur = formatDuration(e.durationMs || 0);
    const tech = (e.technician || 'Technician').replace(/</g, '&lt;');
    return `<div class="conn-log-item"><span class="cl-tech">${tech}</span><span class="cl-when">${when}</span><span class="cl-dur">${dur}</span></div>`;
  }).join('');
}

// Formats the raw 9-digit device code as "123 456 789" for readability —
// matches the grouping a technician would expect when typing it back in.
function formatSupportCode(code) {
  const digits = String(code || '').replace(/\D/g, '');
  if (digits.length !== 9) return code || '';
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

function showSupportCode(code) {
  if (!supportCodeDisplay) return;
  supportCodeDisplay.textContent = code ? formatSupportCode(code) : '— — —';
}

if (copyCodeBtn) {
  copyCodeBtn.addEventListener('click', async () => {
    const raw = (supportCodeDisplay?.textContent || '').replace(/\s/g, '');
    if (!raw || raw === '———') return;
    try {
      await navigator.clipboard.writeText(raw);
      copyCodeBtn.textContent = 'Copied!';
      copyCodeBtn.classList.add('copied');
      setTimeout(() => { copyCodeBtn.textContent = 'Copy'; copyCodeBtn.classList.remove('copied'); }, 2000);
    } catch (_) { /* clipboard access denied — silently ignore */ }
  });
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

// Check for updates (manual)
if (checkUpdateBtn) {
  checkUpdateBtn.addEventListener('click', async () => {
    const origText = checkUpdateBtn.textContent;
    checkUpdateBtn.textContent = 'Checking...';
    checkUpdateBtn.disabled = true;
    try {
      await checkForUpdateAndShowBanner();
    } finally {
      checkUpdateBtn.textContent = origText;
      checkUpdateBtn.disabled = false;
    }
  });
}

// Create desktop shortcut (Windows .lnk, macOS alias)
function showShortcutMessage(text, isError) {
  if (!shortcutMessage) return;
  shortcutMessage.textContent = text;
  shortcutMessage.style.display = 'block';
  shortcutMessage.className = 'shortcut-message' + (isError ? ' shortcut-message-error' : ' shortcut-message-ok');
}
if (createShortcutBtn) {
  createShortcutBtn.addEventListener('click', async () => {
    if (!window.helperApi || !window.helperApi.createDesktopShortcut) return;
    const origText = createShortcutBtn.textContent;
    createShortcutBtn.textContent = 'Creating...';
    createShortcutBtn.disabled = true;
    if (shortcutMessage) shortcutMessage.style.display = 'none';
    try {
      const result = await window.helperApi.createDesktopShortcut();
      if (result && result.success) {
        showShortcutMessage('Desktop shortcut created.', false);
      } else {
        showShortcutMessage(result && result.error ? result.error : 'Could not create shortcut.', true);
      }
    } catch (e) {
      showShortcutMessage(e.message || 'Could not create shortcut.', true);
    } finally {
      createShortcutBtn.textContent = origText;
      createShortcutBtn.disabled = false;
    }
  });
}

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
    else if (!result?.canceled) log(`Saved to ${result.filePath || 'downloads'}`);
  };
}

async function setupDownloadSettings() {
  const pathEl = document.getElementById('downloadDirPath');
  const changeBtn = document.getElementById('changeDownloadDir');
  const askEl = document.getElementById('alwaysAskDownload');
  if (!window.helperApi.getDownloadSettings) return;
  try {
    const s = await window.helperApi.getDownloadSettings();
    if (pathEl) { pathEl.textContent = s.dir; pathEl.title = s.dir; }
    if (askEl) askEl.checked = !!s.alwaysAsk;
  } catch (_) {}
  if (changeBtn) changeBtn.onclick = async () => {
    try {
      const r = await window.helperApi.chooseDownloadDir();
      if (r && !r.canceled && pathEl) { pathEl.textContent = r.dir; pathEl.title = r.dir; }
    } catch (_) {}
  };
  if (askEl) askEl.addEventListener('change', () => {
    window.helperApi.setAlwaysAskDownload(askEl.checked).catch(() => {});
  });
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

  // Safety: "Allow unattended connections" always starts OFF on launch. When
  // the user turns it on it auto-disables after 1 hour of idle time (see the
  // countdown next to the checkbox). It is never restored as "on" across
  // restarts.
  allowUnattended.checked = false;
  if (window.helperApi.setAllowUnattended) {
    window.helperApi.setAllowUnattended(false).catch(() => {});
  }
  stopUnattendedTimer();
  allowUnattended.addEventListener('change', onUnattendedToggle);

  setStatusUI('Getting session...', 'dot-amber');
  const info = await window.helperApi.getInfo();
  config = info.config;
  log(`Device ID: ${info.deviceId}`);
  log(`Server: ${config.server}`);
  showSupportCode(info.shortCode);
  // Device registration runs in parallel with startup and can still be in
  // flight here (it's a network call), leaving the code blank above — pick
  // it up once it resolves instead of staying blank until next restart.
  if (window.helperApi.onShortCodeUpdated) {
    window.helperApi.onShortCodeUpdated((code) => showSupportCode(code));
  }
  loadIceServers(); // fetch STUN/TURN (async; falls back to STUN until it returns)

  let sessionReady = false;
  let fromPending = false;
  try {
    const assign = await window.helperApi.assignSession(allowUnattended.checked);
    fromPending = !!assign.fromPending;
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
  setupDownloadSettings();
  setupConnLog();

  // Auto-start preference toggle
  const autoStartEl = document.getElementById('autoStart');
  if (autoStartEl && window.helperApi.getAutoStart) {
    try { autoStartEl.checked = await window.helperApi.getAutoStart(); } catch (_) {}
    autoStartEl.addEventListener('change', () => {
      window.helperApi.setAutoStart(autoStartEl.checked).catch(() => {});
    });
  }

  // Technician requested a session while we were idle (pushed over the presence
  // socket): start support in place — do NOT reload, because a reload re-runs
  // init() which resets the unattended toggle to off and drops the "requested"
  // context. We adopt the pushed session id so the helper and the technician
  // use the same session.
  if (window.helperApi.onPendingSession) {
    window.helperApi.onPendingSession((data) => {
      if (connectedTechnicians.length > 0) return;
      const busy = isConnected
        || startBtn.classList.contains('btn-waiting')
        || startBtn.classList.contains('btn-stop');
      if (busy) return;
      if (data && data.sessionId) {
        currentSessionId = data.sessionId;
        showSessionId(data.sessionId, false);
      }
      log('Technician requested a session — starting (approval required to view).');
      startBtn.click();
    });
  }

  // Customer pressed "End session" on the being-viewed overlay.
  if (window.helperApi.onOverlayEndSession) {
    window.helperApi.onOverlayEndSession(() => {
      log('Session ended by user (overlay).');
      disconnect().catch(e => log(`Disconnect failed: ${e.message}`));
    });
  }

  // Check for helper update (after we have config), then re-check periodically
  // so a long-running helper picks up new versions without a restart.
  checkForUpdateAndShowBanner();
  if (updateCheckTimer) clearInterval(updateCheckTimer);
  updateCheckTimer = setInterval(() => {
    checkForUpdateAndShowBanner().catch(() => {});
  }, UPDATE_CHECK_INTERVAL_MS);

  // Start support when unattended is on (always ready), or when a technician
  // requested this session. Streaming to each technician is still gated on the
  // customer's approval per connection (attended mode), so nothing is shown
  // until they accept.
  if (sessionReady && (allowUnattended.checked || fromPending)) {
    if (allowUnattended.checked) log('Auto-starting (unattended mode)...');
    else log('Technician requested a session — starting (approval required to view).');
    startBtn.click();
  }
}

/* ---------- Unattended toggle + auto-off timer ---------- */
function onUnattendedToggle() {
  const on = allowUnattended.checked;
  if (window.helperApi.setAllowUnattended) {
    window.helperApi.setAllowUnattended(on).catch(() => {});
  }
  if (on) startUnattendedTimer();
  else stopUnattendedTimer();
}

function startUnattendedTimer() {
  unattendedOnSince = Date.now();
  updateUnattendedTimerLabel();
  if (unattendedTimerInterval) clearInterval(unattendedTimerInterval);
  unattendedTimerInterval = setInterval(tickUnattendedTimer, 15000);
}

function stopUnattendedTimer() {
  if (unattendedTimerInterval) { clearInterval(unattendedTimerInterval); unattendedTimerInterval = null; }
  unattendedOnSince = 0;
  if (unattendedTimerEl) unattendedTimerEl.textContent = '';
}

function tickUnattendedTimer() {
  if (!allowUnattended.checked) { stopUnattendedTimer(); return; }
  const elapsed = Date.now() - unattendedOnSince;
  // Auto-off only when idle — never cut off an active session mid-connection.
  if (elapsed >= UNATTENDED_MAX_MS && !isConnected) {
    allowUnattended.checked = false;
    if (window.helperApi.setAllowUnattended) window.helperApi.setAllowUnattended(false).catch(() => {});
    stopUnattendedTimer();
    log('Unattended access auto-disabled after 1 hour.');
    return;
  }
  updateUnattendedTimerLabel();
}

function updateUnattendedTimerLabel() {
  if (!unattendedTimerEl) return;
  if (!allowUnattended.checked || !unattendedOnSince) { unattendedTimerEl.textContent = ''; return; }
  const remaining = UNATTENDED_MAX_MS - (Date.now() - unattendedOnSince);
  if (remaining <= 0) {
    unattendedTimerEl.textContent = isConnected ? '· turns off after this session' : '';
  } else {
    unattendedTimerEl.textContent = `· auto-off in ${Math.ceil(remaining / 60000)} min`;
  }
}

/* ---------- File access consent: one gate per session, not per-file ---------- */
// null = not asked yet this session, true/false = the customer's decision (sticky
// for the rest of the session so we don't re-prompt on every file operation).
let fileAccessDecision = null;
let fileAccessChain = Promise.resolve();
function ensureFileAccessApproved(techName) {
  if (fileAccessDecision !== null) return Promise.resolve(fileAccessDecision);
  const run = fileAccessChain.then(async () => {
    const approved = window.helperApi.promptFileAccess
      ? await window.helperApi.promptFileAccess({ technicianName: techName })
      : false;
    fileAccessDecision = approved;
    log(approved ? 'You allowed file access for this session.' : 'You denied file access.');
    return approved;
  });
  fileAccessChain = run.catch(() => {});
  return run;
}

/* ---------- Attended consent: prompt the customer before streaming ---------- */
function requestCustomerApproval(techName) {
  const run = approvalChain.then(() =>
    window.helperApi.promptApproval ? window.helperApi.promptApproval({ technicianName: techName }) : Promise.resolve(false)
  );
  approvalChain = run.catch(() => {});
  return run;
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
  if (!updateInfo?.downloadUrl || !updateNowBtn || !updateProgressWrap) return;
  updateNowBtn.disabled = true;
  if (updateNextSessionBtn) updateNextSessionBtn.disabled = true;
  updateProgressWrap.style.display = 'block';
  if (updateProgressBarFill) updateProgressBarFill.style.width = '0%';
  if (updateProgressText) updateProgressText.textContent = 'Downloading...';
  const removeProgressListener = window.helperApi.onUpdateDownloadProgress && window.helperApi.onUpdateDownloadProgress((data) => {
    if (updateProgressBarFill) updateProgressBarFill.style.width = `${data.percent || 0}%`;
    if (updateProgressText) {
      if (data.percent >= 100) updateProgressText.textContent = 'Complete. Opening installer...';
      else if (data.total) updateProgressText.textContent = `Downloading... ${data.percent}%`;
      else updateProgressText.textContent = 'Downloading...';
    }
  });
  try {
    const installerPath = await window.helperApi.downloadUpdate(updateInfo.downloadUrl);
    if (updateProgressText) updateProgressText.textContent = 'Opening installer...';
    if (removeProgressListener) removeProgressListener();
    await window.helperApi.installUpdateAndQuit(installerPath);
  } catch (e) {
    log(`Update failed: ${e.message}`);
    if (removeProgressListener) removeProgressListener();
    if (updateProgressText) updateProgressText.textContent = `Failed: ${e.message}`;
    updateNowBtn.disabled = false;
    if (updateNextSessionBtn) updateNextSessionBtn.disabled = false;
  }
}

async function ensureMonitors() {
  if (!monitors.length) {
    try {
      monitors = await window.helperApi.getMonitors();
    } catch (e) {
      log(`Could not enumerate monitors: ${e.message}`);
    }
  }
  return monitors;
}

function allPeerConnections() {
  return peerConnectionsBySocketId.size
    ? Array.from(peerConnectionsBySocketId.values())
    : (peerConnection ? [peerConnection] : []);
}

// Send the monitor list + control capabilities to the session room. Emitted on
// connect AND whenever a technician joins — a late-joining viewer would
// otherwise miss the one-time broadcast and see no monitors (Split disabled).
function emitCapabilities(sessionId) {
  window.helperApi.socketEmit('helper-capabilities', {
    sessionId: sessionId || currentSessionId,
    capabilities,
    displays: monitors
  });
}

// Tell the viewer which media-stream id is the main pane vs. the second pane,
// plus which monitor each currently shows and whether split is active.
function broadcastTrackMap() {
  if (!currentSessionId) return;
  window.helperApi.socketEmit('track-map', {
    sessionId: currentSessionId,
    main: mainMs.id,
    second: secondMs.id,
    mainMonitor: mainMonitorIndex,
    secondMonitor: secondMonitorIndex,
    splitEnabled
  });
}

// Capture one monitor at its physical resolution. Returns a fresh stream.
async function captureMonitor(monitorIndex) {
  await ensureMonitors();
  const mon = monitors[monitorIndex] || monitors[0];
  if (!mon || !mon.sourceId) {
    throw new Error('No screen source available');
  }
  const captureWidth = mon.width || 1920;
  const captureHeight = mon.height || 1080;
  log(`Capturing monitor ${monitorIndex + 1} (${mon.label}): ${captureWidth}x${captureHeight}`);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: mon.sourceId,
          minWidth: captureWidth,
          minHeight: captureHeight,
          maxWidth: captureWidth,
          maxHeight: captureHeight,
          maxFrameRate: 60
        }
      }
    });
    // Screen content: prioritize sharpness over smooth motion.
    stream.getVideoTracks().forEach(track => {
      if ('contentHint' in track) track.contentHint = 'detail';
    });
    return stream;
  } catch (error) {
    log(`Screen capture error: ${error.message}`);
    if (capabilities.platform === 'darwin') {
      log('On macOS: grant Screen Recording permission — System Settings → Privacy & Security → Screen Recording → enable for this app, then try again.');
    }
    throw error;
  }
}

// Main-pane capture (used at session start and when switching the main monitor).
async function startScreenCapture(overrideIndex) {
  const idx = overrideIndex != null ? overrideIndex : mainMonitorIndex;
  const newStream = await captureMonitor(idx);
  if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
  mediaStream = newStream;
  mainMonitorIndex = idx;
  log('Screen capture started');
  return mediaStream;
}

// Switch which monitor the main pane shows — swap the sent track on every peer.
async function applyMainMonitor(idx) {
  if (idx < 0 || idx >= monitors.length) return;
  const stream = await captureMonitor(idx);
  const track = stream.getVideoTracks()[0];
  for (const pc of allPeerConnections()) {
    if (pc._mainSender) { try { await pc._mainSender.replaceTrack(track); } catch (_) {} }
  }
  if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
  mediaStream = stream;
  mainMonitorIndex = idx;
  log(`Main pane → monitor ${idx + 1}`);
  broadcastTrackMap();
}

// Switch which monitor the second (split) pane shows.
async function applySecondMonitor(idx) {
  if (idx < 0 || idx >= monitors.length) return;
  secondMonitorIndex = idx;
  if (!splitEnabled) { broadcastTrackMap(); return; }
  const stream = await captureMonitor(idx);
  const track = stream.getVideoTracks()[0];
  for (const pc of allPeerConnections()) {
    if (pc._secondSender) { try { await pc._secondSender.replaceTrack(track); } catch (_) {} }
  }
  if (secondaryStream) secondaryStream.getTracks().forEach(t => t.stop());
  secondaryStream = stream;
  log(`Second pane → monitor ${idx + 1}`);
  broadcastTrackMap();
}

// Enable/disable the second feed. No renegotiation: the second video
// transceiver is created up front, so we just attach/detach a track.
async function setSplit(enabled, idx) {
  if (typeof idx === 'number') secondMonitorIndex = idx;
  if (enabled) {
    splitEnabled = true;
    const stream = await captureMonitor(secondMonitorIndex);
    const track = stream.getVideoTracks()[0];
    for (const pc of allPeerConnections()) {
      if (pc._secondSender) { try { await pc._secondSender.replaceTrack(track); } catch (_) {} }
    }
    if (secondaryStream) secondaryStream.getTracks().forEach(t => t.stop());
    secondaryStream = stream;
    log(`Split view ON — monitor ${secondMonitorIndex + 1}`);
  } else {
    splitEnabled = false;
    for (const pc of allPeerConnections()) {
      if (pc._secondSender) { try { await pc._secondSender.replaceTrack(null); } catch (_) {} }
    }
    if (secondaryStream) { secondaryStream.getTracks().forEach(t => t.stop()); secondaryStream = null; }
    log('Split view OFF');
  }
  broadcastTrackMap();
}

async function connectSignaling(sessionId) {
  log('Connecting to signaling server...');

  try {
    await window.helperApi.socketConnect(sessionId);
    log('Connected to signaling server');

    // Avoid duplicated IPC listeners across reconnects.
    clearSignalingListeners();

    // Emit capabilities + monitor info so technician sees them immediately
    await ensureMonitors();
    emitCapabilities(sessionId);
    broadcastTrackMap();

    signalingUnsubscribers.push(window.helperApi.onFileAvailable((data) => {
      if (data.direction === 'technician-to-user' || !data.direction) {
        receivedFiles.push({
          id: data.id,
          name: data.original_name || data.originalName,
          downloadUrl: data.downloadUrl
        });
        showFileNotification();
        log(`File received`);
      }
    }));

    signalingUnsubscribers.push(window.helperApi.onSwitchMonitor(async (data) => {
      const idx = data.monitorIndex;
      await ensureMonitors();
      if (typeof idx !== 'number' || idx < 0 || idx >= monitors.length) {
        log(`Monitor ${idx + 1} not available`);
        return;
      }
      try {
        if (data.pane === 'second') await applySecondMonitor(idx);
        else await applyMainMonitor(idx);
      } catch (e) {
        log(`Switch monitor failed: ${e.message}`);
      }
    }));

    // Split view: technician toggles the second feed on/off (and picks its monitor).
    signalingUnsubscribers.push(window.helperApi.onSetSplit(async (data) => {
      try {
        await setSplit(!!data.enabled, typeof data.monitorIndex === 'number' ? data.monitorIndex : undefined);
      } catch (e) {
        log(`Set split failed: ${e.message}`);
      }
    }));

    // Quick actions (lock screen / reboot). Attended mode confirms with the
    // customer first; unattended mode executes directly (see main.js comment).
    if (window.helperApi.onQuickAction) {
      signalingUnsubscribers.push(window.helperApi.onQuickAction(async (data) => {
        const action = data && data.action;
        if (action !== 'lock' && action !== 'reboot') return;
        const techName = (connectedTechnicians[0] || {}).technicianName || 'The technician';

        if (!allowUnattended.checked) {
          const ok = window.helperApi.confirmQuickAction
            ? await window.helperApi.confirmQuickAction({ action, technicianName: techName })
            : false;
          if (!ok) { log(`You denied the ${action} request.`); return; }
        }

        log(`Executing: ${action}...`);
        const result = action === 'reboot'
          ? await window.helperApi.rebootMachine()
          : await window.helperApi.lockScreen();
        if (result && result.error) log(`${action} failed: ${result.error}`);
      }));
    }

    signalingUnsubscribers.push(window.helperApi.onSetStreamQuality(async (data) => {
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
            enc.maxFramerate = 30;
            params.degradationPreference = 'balanced';
          } else if (quality === 'quality') {
            enc.scaleResolutionDownBy = 1;
            enc.maxBitrate = 16000000;
            enc.maxFramerate = 60;
            enc.priority = 'high';
            enc.networkPriority = 'high';
            params.degradationPreference = 'maintain-framerate';
          } else {
            enc.scaleResolutionDownBy = 1;
            enc.maxBitrate = 10000000;
            enc.maxFramerate = 60;
            params.degradationPreference = 'maintain-framerate';
          }
          await sender.setParameters(params);
        } catch (e) {
          log(`Set quality failed: ${e.message}`);
        }
      }
      log(`Stream: ${quality}`);
    }));

    // Set up event listeners for signaling (multi-viewer: route by data.from)
    signalingUnsubscribers.push(window.helperApi.onWebrtcAnswer(async (data) => {
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
    }));

    signalingUnsubscribers.push(window.helperApi.onWebrtcIceCandidate(async (data) => {
      const pc = (data.role === 'technician' && data.from) ? peerConnectionsBySocketId.get(data.from) : peerConnection;
      if (!pc) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (error) {
        log(`Error adding ICE candidate: ${error.message}`);
      }
    }));

    signalingUnsubscribers.push(window.helperApi.onPeerJoined((data) => {
      log(`Peer joined: ${data.role}`);
    }));

    connectedTechnicians = [];
    signalingUnsubscribers.push(window.helperApi.onTechniciansPresent((data) => {
      if (data.technicians && Array.isArray(data.technicians)) {
        connectedTechnicians = data.technicians.slice();
        updateConnectedTechniciansUI();
        data.technicians.forEach(t => {
          if (t.technicianSocketId && !peerConnectionsBySocketId.has(t.technicianSocketId)) {
            createPeerConnectionForTechnician(sessionId, t.technicianSocketId);
          }
        });
      }
    }));
    signalingUnsubscribers.push(window.helperApi.onTechnicianJoined((data) => {
      const id = data.technicianId || data.socketId;
      if (id && !connectedTechnicians.some(t => t.technicianId === id)) {
        connectedTechnicians.push({ technicianId: id, technicianName: data.technicianName || 'Technician' });
        updateConnectedTechniciansUI();
        if (isConnected) updateOverlay(true); // refresh overlay with the new name
      }
      const socketId = data.technicianSocketId;
      if (socketId && !peerConnectionsBySocketId.has(socketId)) {
        createPeerConnectionForTechnician(sessionId, socketId);
      }
    }));
    signalingUnsubscribers.push(window.helperApi.onTechnicianLeft((data) => {
      const id = data.technicianId;
      if (id) {
        connectedTechnicians = connectedTechnicians.filter(t => t.technicianId !== id);
        updateConnectedTechniciansUI();
      }
      const socketId = data.technicianSocketId;
      if (socketId) {
        // Revoke this technician's approval so a rejoin must be approved again.
        approvedTechnicians.delete(socketId);
        approvalPending.delete(socketId);
        const pc = peerConnectionsBySocketId.get(socketId);
        if (pc) {
          clearReconnectState(pc); // explicit leave — no reconnect attempt should follow
          pc.close();
          peerConnectionsBySocketId.delete(socketId);
          if (peerConnection === pc) peerConnection = peerConnectionsBySocketId.values().next().value || null;
        }
      }
      // If no technicians remain, handle gracefully (stay ready if unattended)
      if (connectedTechnicians.length === 0 && peerConnectionsBySocketId.size === 0) {
        handleAllTechniciansGone();
      }
    }));

    // Log approval events (dialog is handled in main process)
    if (typeof window.helperApi.onConnectionRequest === 'function') {
      signalingUnsubscribers.push(window.helperApi.onConnectionRequest((data) => {
        if (!allowUnattended.checked) {
          log(`Connection request from ${data?.technicianName || 'Technician'}...`);
        }
      }));
    }
    if (typeof window.helperApi.onConnectionResponse === 'function') {
      signalingUnsubscribers.push(window.helperApi.onConnectionResponse((data) => {
        log(data?.approved ? 'Connection approved.' : 'Connection denied.');
      }));
    }

    // Chat messages from technician — show notification, auto-open chat window
    signalingUnsubscribers.push(window.helperApi.onChatMessage((data) => {
      showChatNotification(data);
      window.helperApi.openChatWindow();
    }));

    // Handle remote control events
    signalingUnsubscribers.push(window.helperApi.onMouseEvent((data) => {
      console.log('Remote mouse event:', data);
    }));

    signalingUnsubscribers.push(window.helperApi.onKeyboardEvent((data) => {
      if (data.type === 'keydown') log(`[keyboard] received: ${data.key} (${data.code})`);
    }));

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
        out[out.length - 1] = line + ';x-google-min-bitrate=4000;x-google-start-bitrate=16000;x-google-max-bitrate=16000';
      }
    }
  }
  return out.join('\r\n');
}

// Network-drop resilience: a transient blip should not tear down the session
// or require re-approval. On 'disconnected' we wait a grace period (ICE often
// recovers on its own); if it doesn't, we try ICE restarts (fresh candidates
// on the SAME peer connection — tracks/datachannels are preserved) before
// giving up and falling back to the previous teardown behavior.
const RECONNECT_GRACE_MS = 8000;
const RECONNECT_MAX_ATTEMPTS = 3;
const RECONNECT_RETRY_MS = 6000;

async function sendOfferOnPc(pc, sessionId, targetSocketId) {
  const offer = await pc.createOffer();
  const boostedOffer = new RTCSessionDescription({ type: offer.type, sdp: boostSdpBitrate(offer.sdp) });
  await pc.setLocalDescription(boostedOffer);
  await window.helperApi.socketSendOffer({
    sessionId,
    offer: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
    role: 'helper',
    targetSocketId
  });
}

function clearReconnectState(pc) {
  if (pc._reconnectTimer) { clearTimeout(pc._reconnectTimer); pc._reconnectTimer = null; }
  pc._reconnectAttempts = 0;
}

// Called when a technician's pc goes disconnected/failed. Schedules a grace
// period, then attempts ICE restarts; onGiveUp runs only if all attempts fail.
function handlePcInterrupted(pc, sessionId, targetSocketId, onGiveUp) {
  if (pc._reconnectTimer) return; // already handling this interruption
  pc._reconnectAttempts = pc._reconnectAttempts || 0;

  const attempt = async () => {
    pc._reconnectTimer = null;
    if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') return; // recovered
    if (pc.signalingState === 'closed') return; // pc was closed elsewhere (e.g. technician-left)

    if (pc._reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
      log(`Reconnect failed after ${RECONNECT_MAX_ATTEMPTS} attempts for ${targetSocketId}.`);
      onGiveUp();
      return;
    }
    pc._reconnectAttempts++;
    log(`Network drop detected — attempting to reconnect (${pc._reconnectAttempts}/${RECONNECT_MAX_ATTEMPTS})...`);
    try {
      if (typeof pc.restartIce === 'function') pc.restartIce();
      await sendOfferOnPc(pc, sessionId, targetSocketId);
    } catch (e) {
      log(`Reconnect attempt failed: ${e.message}`);
    }
    // Schedule the next check/attempt in case this one doesn't land either.
    pc._reconnectTimer = setTimeout(attempt, RECONNECT_RETRY_MS);
  };

  pc._reconnectTimer = setTimeout(attempt, RECONNECT_GRACE_MS);
}

// Every peer gets two video senders: the main pane (advertised under mainMs's
// id) and a prenegotiated second sender for the split pane (under secondMs's
// id). The second starts empty and is filled via replaceTrack when split is
// enabled, so toggling split needs no renegotiation.
function addVideoTransceivers(pc) {
  const mainTrack = mediaStream ? mediaStream.getVideoTracks()[0] : null;
  if (mainTrack) {
    pc._mainSender = pc.addTrack(mainTrack, mainMs);
  } else {
    pc._mainSender = pc.addTransceiver('video', { direction: 'sendonly', streams: [mainMs] }).sender;
  }
  pc._secondSender = pc.addTransceiver('video', { direction: 'sendonly', streams: [secondMs] }).sender;
  if (splitEnabled && secondaryStream) {
    const st = secondaryStream.getVideoTracks()[0];
    if (st) { try { pc._secondSender.replaceTrack(st); } catch (_) {} }
  }
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
            const ordered = [...h264, ...vp9, ...vp8, ...rest];
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
    enc.maxFramerate = 60;
    enc.priority = 'high';
    enc.networkPriority = 'high';
    // Under pressure: reduce resolution rather than dropping frames (avoids stutter)
    params.degradationPreference = 'maintain-framerate';
    await sender.setParameters(params);
  } catch (_) { /* some implementations reject before connection */ }
}

async function createPeerConnectionForTechnician(sessionId, targetSocketId) {
  if (!mediaStream) return;

  // Attended mode: do NOT stream to this technician until the customer approves.
  // A decline means no peer connection is created at all — nothing is shown.
  if (!allowUnattended.checked && !approvedTechnicians.has(targetSocketId)) {
    if (approvalPending.has(targetSocketId) || peerConnectionsBySocketId.has(targetSocketId)) return;
    approvalPending.add(targetSocketId);
    setStatusUI('A technician is requesting access — awaiting your approval', 'dot-amber');
    const techName = (connectedTechnicians.find(t => t.technicianSocketId === targetSocketId) || {}).technicianName || 'A technician';
    let approved = false;
    try { approved = await requestCustomerApproval(techName); }
    finally { approvalPending.delete(targetSocketId); }
    if (!approved) {
      log('You declined the connection — the technician was not given access.');
      setStatusUI(isConnected ? 'Connected' : 'Ready', isConnected ? 'dot-green' : '');
      window.helperApi.socketEmit('connection-declined', { sessionId, targetSocketId });
      return;
    }
    approvedTechnicians.add(targetSocketId);
    log('You approved the connection.');
  }

  log(`Creating WebRTC peer connection for technician ${targetSocketId}...`);

  const pc = new RTCPeerConnection({ iceServers });
  peerConnectionsBySocketId.set(targetSocketId, pc);
  if (!peerConnection) peerConnection = pc;

  addVideoTransceivers(pc);

  preferScreenCodecs(pc);
  applyInitialQuality(pc);

  // Create data channel for low-latency mouse/keyboard (unreliable, unordered = UDP-like)
  try {
    const controlChannel = pc.createDataChannel('control', { ordered: false, maxRetransmits: 0 });
    controlChannel.binaryType = 'arraybuffer';
    controlChannel.onopen = () => log('[DataChannel] control channel open');
    controlChannel.onclose = () => log('[DataChannel] control channel closed');

    controlChannel.onmessage = async (evt) => {
      try {
        let input = evt.data;
        if (input instanceof Blob) input = await input.arrayBuffer();

        if (input instanceof ArrayBuffer) {
          const dv = new DataView(input);
          const type = dv.getUint8(0);
          const nx = dv.getUint16(1, true) / 65535;
          const ny = dv.getUint16(3, true) / 65535;

          if (type === 0x01) { // Move
            window.helperApi.injectControl({ type: 'mouse', data: { type: 'mousemove', x: nx, y: ny } });
          } else if (type === 0x02 || type === 0x03) { // Down/Up
            const btnIdx = dv.getUint8(5);
            window.helperApi.injectControl({ type: 'mouse', data: { type: type === 0x02 ? 'mousedown' : 'mouseup', x: nx, y: ny, button: btnIdx } });
          } else if (type === 0x04) { // Scroll
            const dx = dv.getInt16(5, true);
            const dy = dv.getInt16(7, true);
            window.helperApi.injectControl({ type: 'mouse', data: { type: 'scroll', x: nx, y: ny, deltaX: dx, deltaY: dy } });
          }
          return;
        }

        if (typeof input === 'string') {
          const msg = JSON.parse(input);
          if (msg.kind === 'mouse') {
            window.helperApi.injectControl({ type: 'mouse', data: msg });
          } else if (msg.kind === 'keyboard') {
            window.helperApi.injectControl({ type: 'keyboard', data: msg });
          } else if (msg.kind === 'chat') {
            showChatNotification(msg.text);
          }
        }
      } catch (e) { console.error('DC error', e); }
    };

    // Create data channel for File Transfer (reliable, ordered)
    const filesChannel = pc.createDataChannel('files', { ordered: true });
    filesChannel.onopen = () => log('[DataChannel] files channel open');

    filesChannel.onmessage = async (evt) => {
      try {
        const data = typeof evt.data === 'string' ? JSON.parse(evt.data) : null;
        if (!data || !data.action) return;

        // File browser (drives/list/read/write/mkdir/delete/rename) needs the
        // customer's explicit, one-time-per-session consent before touching
        // the filesystem at all.
        const gatedActions = ['drives', 'list', 'read', 'write', 'mkdir', 'delete', 'rename'];
        if (gatedActions.includes(data.action)) {
          const techName = (connectedTechnicians.find(t => t.technicianSocketId === targetSocketId) || {}).technicianName || 'The technician';
          const allowed = await ensureFileAccessApproved(techName);
          if (!allowed) {
            const responseAction = data.action === 'write' ? 'write-ack' : `${data.action}-response`;
            filesChannel.send(JSON.stringify({ action: responseAction, reqId: data.reqId, error: 'File access denied by user' }));
            return;
          }
        }

        if (data.action === 'drives') {
          const drives = await window.helperApi.fsDrives();
          filesChannel.send(JSON.stringify({ action: 'drives-response', reqId: data.reqId, drives }));
        }
        else if (data.action === 'list') {
          try {
            const items = await window.helperApi.fsList(data.path);
            filesChannel.send(JSON.stringify({ action: 'list-response', reqId: data.reqId, items }));
          } catch (e) {
            filesChannel.send(JSON.stringify({ action: 'list-response', reqId: data.reqId, error: e.message }));
          }
        }
        else if (data.action === 'read') {
          // Basic read chunk implementation
          // If size is small, we can read whole file? No, assume chunks requested or whole file requested?
          // The protocol should support chunking requests.
          // For V1, let's assume request contains offset/length.
          // If not, allow downloading whole file in one go? (Risk of memory limit)
          // Let's implement chunk reading.
          try {
            const buffer = await window.helperApi.fsReadChunk(data.path, data.offset || 0, data.length || 64 * 1024);
            // Convert buffer to Base64
            const b64 = buffer ? d2b(buffer) : '';
            filesChannel.send(JSON.stringify({
              action: 'read-response',
              reqId: data.reqId,
              chunk: b64,
              offset: data.offset || 0,
              eof: !buffer || buffer.byteLength < (data.length || 64 * 1024)
            }));
          } catch (e) {
            filesChannel.send(JSON.stringify({ action: 'read-response', reqId: data.reqId, error: e.message }));
          }
        }
        else if (data.action === 'write') {
          try {
            // data.chunk is base64
            if (data.chunk) {
              const buf = b2d(data.chunk); // decode
              await window.helperApi.fsWriteChunk(data.path, buf, data.offset || 0);
            }
            filesChannel.send(JSON.stringify({ action: 'write-ack', reqId: data.reqId }));
          } catch (e) {
            filesChannel.send(JSON.stringify({ action: 'write-ack', reqId: data.reqId, error: e.message }));
          }
        }
        else if (data.action === 'mkdir') {
          try {
            await window.helperApi.fsMkdir(data.path);
            filesChannel.send(JSON.stringify({ action: 'mkdir-response', reqId: data.reqId }));
          } catch (e) {
            filesChannel.send(JSON.stringify({ action: 'mkdir-response', reqId: data.reqId, error: e.message }));
          }
        }
        else if (data.action === 'delete') {
          try {
            await window.helperApi.fsDelete(data.path);
            filesChannel.send(JSON.stringify({ action: 'delete-response', reqId: data.reqId }));
          } catch (e) {
            filesChannel.send(JSON.stringify({ action: 'delete-response', reqId: data.reqId, error: e.message }));
          }
        }
        else if (data.action === 'rename') {
          try {
            await window.helperApi.fsRename(data.path, data.newPath);
            filesChannel.send(JSON.stringify({ action: 'rename-response', reqId: data.reqId }));
          } catch (e) {
            filesChannel.send(JSON.stringify({ action: 'rename-response', reqId: data.reqId, error: e.message }));
          }
        }
      } catch (e) {
        console.error('FileDC error:', e);
      }
    };

  } catch (e) {
    log('[DataChannel] Failed to create: ' + e.message);
  }

  // Helper to convert Buffer/ArrayBuffer to Base64 (d2b) and back (b2d)
  // Since we are in browser environment in renderer:
  function d2b(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
  function b2d(b64) {
    const bin = window.atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  }

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
      clearReconnectState(pc);
      if (!isConnected) startConnectedTimer();
      isConnected = true;
      startBtn.textContent = 'Stop Support';
      startBtn.className = 'btn-primary btn-stop';
      startBtn.disabled = false;
    } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
      // Don't tear down immediately — try to recover from a transient network
      // drop first (no re-approval needed; this is the same peer connection).
      handlePcInterrupted(pc, sessionId, targetSocketId, () => {
        peerConnectionsBySocketId.delete(targetSocketId);
        if (peerConnection === pc) peerConnection = peerConnectionsBySocketId.values().next().value || null;
        const stillAny = Array.from(peerConnectionsBySocketId.values()).some(p => p.iceConnectionState === 'connected');
        if (!stillAny) handleAllTechniciansGone();
      });
    }
  };

  await sendOfferOnPc(pc, sessionId, targetSocketId);
  log(`Offer sent to technician ${targetSocketId}`);
  await ensureMonitors();
  emitCapabilities(sessionId);
  broadcastTrackMap();
  return pc;
}

async function createPeerConnection(sessionId) {
  log('Creating WebRTC peer connection...');
  peerConnection = new RTCPeerConnection({ iceServers });

  addVideoTransceivers(peerConnection);

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
      startBtn.textContent = 'Stop Support';
      startBtn.className = 'btn-primary btn-stop';
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
  await ensureMonitors();
  emitCapabilities(sessionId);
  broadcastTrackMap();
  return peerConnection;
}

function setDisconnected() {
  isConnected = false;
  stopConnectedTimer();
  connectedTechnicians = [];
  updateConnectedTechniciansUI();
  startBtn.textContent = 'Request Support';
  startBtn.className = 'btn-primary btn-request';
  startBtn.disabled = false;
}

// When all technicians leave but unattended mode is on: stay ready for the next connection
function handleAllTechniciansGone() {
  stopConnectedTimer();
  endConnectionLog();
  isConnected = false;
  connectedTechnicians = [];
  updateConnectedTechniciansUI();
  // Clean up dead peer connections but keep signaling + screen capture alive
  peerConnectionsBySocketId.forEach(pc => { clearReconnectState(pc); pc.close(); });
  peerConnectionsBySocketId.clear();
  peerConnection = null;
  if (allowUnattended.checked && mediaStream) {
    setStatusUI('Waiting for technician...', 'dot-amber');
    startBtn.textContent = 'Support Requested';
    startBtn.className = 'btn-primary btn-waiting';
    startBtn.disabled = false;
    log('Technician disconnected. Waiting for next connection (unattended mode).');
  } else {
    // If unattended is off, end the session cleanly so server status does not stay "connected".
    disconnect().catch(e => log(`Disconnect failed: ${e.message}`));
  }
}

async function disconnect() {
  if (disconnecting) return;
  disconnecting = true;
  log('Disconnecting...');
  endConnectionLog(); // finalize any open history entry (manual Stop path)
  try {
    clearSignalingListeners();
    stopConnectedTimer();
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
    if (secondaryStream) {
      secondaryStream.getTracks().forEach(t => t.stop());
      secondaryStream = null;
    }
    splitEnabled = false;
    approvedTechnicians.clear();
    approvalPending.clear();
    fileAccessDecision = null; // next session starts fresh — must ask again
    peerConnectionsBySocketId.forEach(pc => { clearReconnectState(pc); pc.close(); });
    peerConnectionsBySocketId.clear();
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    await window.helperApi.socketDisconnect();
    connectedTechnicians = [];
    updateConnectedTechniciansUI();
    setDisconnected();
    setStatusUI('Ready', 'dot-green');
    log('Disconnected');
  } finally {
    disconnecting = false;
  }
}

startBtn.addEventListener('click', async () => {
  // If connected or waiting — stop support
  if (isConnected || startBtn.classList.contains('btn-waiting') || startBtn.classList.contains('btn-stop')) {
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
    startBtn.textContent = 'Support Requested';
    startBtn.className = 'btn-primary btn-waiting';
    startBtn.disabled = false;

    log('Ready - when a technician connects they will receive the stream');
  } catch (error) {
    log(`Error: ${error.message}`);
    const isMacCapture = capabilities.platform === 'darwin' && (error.message || '').toLowerCase().includes('video source');
    const statusMsg = isMacCapture
      ? 'Connection failed — grant Screen Recording in System Settings → Privacy & Security → Screen Recording'
      : 'Connection failed';
    setStatusUI(statusMsg, 'dot-red');
    startBtn.disabled = false;
    startBtn.textContent = 'Request Support';
    startBtn.className = 'btn-primary btn-request';
  }
});

init();
