const { app, BrowserWindow, ipcMain, desktopCapturer, screen, shell, clipboard, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');
const { execSync, execFileSync } = require('child_process');
const { io } = require('socket.io-client');

let robot = null;
let robotjsError = null;
try {
  robot = require('robotjs');
  console.log('✅ robotjs loaded successfully');
  console.log('   robotjs version:', robot ? 'loaded' : 'null');
  console.log('   moveMouse available:', typeof robot?.moveMouse === 'function');
  console.log('   mouseToggle available:', typeof robot?.mouseToggle === 'function');
} catch (e) {
  robotjsError = e;
  console.error('❌ robotjs not available (remote control disabled):', e.message);
  console.error('   Error code:', e.code);
  console.error('   Error stack:', e.stack);
  console.error('   This will prevent mouse and keyboard control from working.');
  console.error('   robotjs needs to be compiled for the target platform during build.');
}

// Only allow self-signed certificates when explicitly requested or in unpackaged dev runs.
const allowSelfSigned = process.env.ALLOW_SELF_SIGNED === 'true' || !app.isPackaged;
if (allowSelfSigned) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

let mainWindow;
let chatWindow = null;
let socket = null;
let currentSessionId = null;
let currentAllowUnattended = true;
let chatHistory = [];
let tray = null;
let isQuitting = false;

const MOUSE_BUTTONS = ['left', 'middle', 'right'];

// Get the primary MAC address of this machine
function getMacAddress() {
  const interfaces = os.networkInterfaces();
  for (const [, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs) {
      if (!addr.internal && addr.mac && addr.mac !== '00:00:00:00:00:00' && addr.family === 'IPv4') {
        return addr.mac;
      }
    }
  }
  for (const [, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs) {
      if (!addr.internal && addr.mac && addr.mac !== '00:00:00:00:00:00') {
        return addr.mac;
      }
    }
  }
  return null;
}

function injectMouse(data) {
  if (!robot) {
    console.warn('Mouse injection failed: robotjs not available');
    return;
  }
  try {
    const inputType =
      data.type === 'move' ? 'mousemove' :
      data.type === 'down' ? 'mousedown' :
      data.type === 'up' ? 'mouseup' :
      data.type;
    const bounds = screen.getPrimaryDisplay().bounds;
    const x = Math.round(bounds.x + data.x * bounds.width);
    const y = Math.round(bounds.y + data.y * bounds.height);

    if (inputType === 'mousemove') {
      robot.moveMouse(x, y);
    } else if (inputType === 'mousedown' || inputType === 'mouseup') {
      const btn = MOUSE_BUTTONS[data.button] || 'left';
      if (btn === 'middle' && !robot.mouseToggle) return;
      robot.moveMouse(x, y);
      robot.mouseToggle(inputType === 'mousedown' ? 'down' : 'up', btn);
    } else if (inputType === 'scroll') {
      if (data.deltaX || data.deltaY) {
        robot.moveMouse(x, y);
        const dx = data.deltaX ? (Math.abs(data.deltaX) < 40 ? Math.sign(data.deltaX) : data.deltaX / 40) : 0;
        const dy = data.deltaY ? (Math.abs(data.deltaY) < 40 ? Math.sign(data.deltaY) : data.deltaY / 40) : 0;
        robot.scrollMouse(dx, dy);
      }
    }
  } catch (e) {
    console.error('Mouse injection error:', e.message);
  }
}

// Map browser key names to robotjs key names
const BROWSER_TO_ROBOTJS = {
  'arrowup': 'up', 'arrowdown': 'down', 'arrowleft': 'left', 'arrowright': 'right',
  ' ': 'space', 'escape': 'escape', 'backspace': 'backspace', 'delete': 'delete',
  'enter': 'enter', 'tab': 'tab', 'home': 'home', 'end': 'end',
  'pageup': 'pageup', 'pagedown': 'pagedown', 'insert': 'insert',
  'capslock': 'capslock', 'numlock': 'numlock', 'scrolllock': 'scrolllock',
  'printscreen': 'printscreen', 'pause': 'pause',
  'f1': 'f1', 'f2': 'f2', 'f3': 'f3', 'f4': 'f4', 'f5': 'f5', 'f6': 'f6',
  'f7': 'f7', 'f8': 'f8', 'f9': 'f9', 'f10': 'f10', 'f11': 'f11', 'f12': 'f12',
  'control': 'control', 'shift': 'shift', 'alt': 'alt', 'meta': 'command',
};

function injectKeyboard(data) {
  if (!robot) return;
  try {
    const inputType = data.type === 'down' ? 'keydown' : data.type === 'up' ? 'keyup' : data.type;
    const keyLower = (data.key || '').toLowerCase();
    if (['control', 'shift', 'alt', 'meta'].includes(keyLower)) return;

    const mods = [];
    if (data.ctrlKey) mods.push('control');
    if (data.shiftKey) mods.push('shift');
    if (data.altKey) mods.push('alt');
    if (data.metaKey) mods.push('command');

    let key = null;
    if (data.key) {
      if (data.key.length === 1) key = data.key.toLowerCase();
      else if (BROWSER_TO_ROBOTJS[keyLower]) key = BROWSER_TO_ROBOTJS[keyLower];
    }
    if (!key && data.code) {
      const code = data.code;
      if (code.startsWith('Key') && code.length === 4) key = code.charAt(3).toLowerCase();
      else if (code.startsWith('Digit') && code.length === 6) key = code.charAt(5);
      else if (BROWSER_TO_ROBOTJS[code.toLowerCase()]) key = BROWSER_TO_ROBOTJS[code.toLowerCase()];
    }

    if (key) {
      const down = inputType === 'keydown' ? 'down' : 'up';
      robot.keyToggle(key, down, mods.length ? mods : undefined);
    }
  } catch (e) {
    console.warn('Keyboard inject error:', e.message);
  }
}

function getAppDataDir() {
  const base = process.platform === 'win32' ? process.env.APPDATA :
    process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') :
      path.join(os.homedir(), '.remote-support');
  return path.join(base, 'RemoteSupport');
}

function getPrefsPath() {
  return path.join(getAppDataDir(), 'prefs.json');
}

function readPrefs() {
  try {
    const p = getPrefsPath();
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8')) || {};
  } catch (_) { return {}; }
}

function writePrefs(next) {
  try {
    const dir = getAppDataDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getPrefsPath(), JSON.stringify(next || {}, null, 2), 'utf8');
  } catch (_) { }
}

function getDeviceId() {
  const dir = getAppDataDir();
  const file = path.join(dir, 'device_id.txt');
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const id = require('crypto').randomUUID();
  fs.writeFileSync(file, id);
  return id;
}

function readConfig() {
  const configPath = path.join(process.resourcesPath, 'config.json');
  if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const embeddedId = '___SESSID___';
  let sessionId = '';
  if (!embeddedId.startsWith('___')) sessionId = embeddedId.replace(/_+$/, '');
  return { sessionId, server: process.env.SERVER_URL || '', port: 5500 };
}

function getIconImage() {
  const logoPath = path.join(__dirname, 'renderer', 'logo.png');
  const img = nativeImage.createFromPath(logoPath);
  return img && !img.isEmpty() ? img : null;
}

function ensureTray() {
  if (tray) return tray;
  const img = getIconImage();
  if (!img) return null;
  const trayImg = process.platform === 'darwin' ? img.resize({ width: 18, height: 18 }) : img.resize({ width: 16, height: 16 });
  tray = new Tray(trayImg);
  tray.setToolTip('Remote Support Helper');
  const menu = Menu.buildFromTemplate([
    { label: 'Show Remote Support Helper', click: () => { if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); } } },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => { if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); } });
  return tray;
}

async function handleCloseRequested() {
  const prefs = readPrefs();
  const remembered = prefs && typeof prefs.closeBehavior === 'string' ? prefs.closeBehavior : null;
  if (remembered === 'quit') { isQuitting = true; app.quit(); return; }
  if (remembered === 'background') { ensureTray(); if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide(); return; }

  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: 'Remote Support Helper',
    message: 'Close Remote Support Helper?',
    detail: 'Do you want to quit or keep running in background?',
    buttons: ['Quit', 'Keep Running'],
    defaultId: 1, cancelId: 1, checkboxLabel: 'Remember my choice',
    noLink: true
  });

  if (result.checkboxChecked) {
    writePrefs({ ...prefs, closeBehavior: result.response === 0 ? 'quit' : 'background' });
  }
  if (result.response === 0) { isQuitting = true; app.quit(); return; }
  ensureTray();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
}

function createWindow() {
  const iconImg = getIconImage();
  mainWindow = new BrowserWindow({
    width: 520, height: 680, minWidth: 400, minHeight: 500, resizable: true,
    icon: iconImg || undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      (function() {
        const h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) + 40;
        return { width: 520, height: Math.min(Math.max(h, 500), 900) };
      })()
    `).then(size => { if (size?.height) mainWindow.setSize(size.width, size.height); }).catch(() => { });
  });

  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    handleCloseRequested().catch(() => { try { ensureTray(); mainWindow.hide(); } catch (_) { } });
  });
}

app.on('before-quit', () => { isQuitting = true; });
app.whenReady().then(createWindow);
app.on('activate', () => { if (!mainWindow || mainWindow.isDestroyed()) createWindow(); else mainWindow.show(); });

ipcMain.handle('helper:get-info', () => ({ deviceId: getDeviceId(), config: readConfig(), platform: process.platform, hostname: os.hostname(), arch: os.arch() }));
ipcMain.handle('helper:get-version', () => app.getVersion());

function getHelperBuildTime() {
  try {
    const exePath = app.getPath('exe');
    if (exePath && fs.existsSync(exePath)) return Math.floor(fs.statSync(exePath).mtimeMs);
  } catch (_) { }
  try {
    const pkgPath = path.join(app.getAppPath(), 'package.json');
    if (fs.existsSync(pkgPath)) return Math.floor(fs.statSync(pkgPath).mtimeMs);
  } catch (_) { }
  return null;
}

ipcMain.handle('helper:check-for-update', async () => {
  try {
    const config = readConfig();
    const base = (config.server || '').replace(/\/$/, '');
    if (!base) return { updateAvailable: false };
    const platform = process.platform === 'darwin' ? 'darwin' : 'win';
    const params = `platform=${platform}&currentVersion=${encodeURIComponent(app.getVersion())}&buildTime=${getHelperBuildTime() || ''}`;
    const url = `${base}/api/helper/update-info?${params}`;
    const lib = url.startsWith('https') ? https : http;
    const data = await new Promise((resolve, reject) => {
      lib.get(url, { rejectUnauthorized: !allowSelfSigned }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
      }).on('error', reject);
    });
    return data;
  } catch (e) { return { updateAvailable: false }; }
});

ipcMain.handle('helper:download-update', async (_event, downloadUrl) => {
  if (!downloadUrl) throw new Error('Invalid URL');
  const ext = process.platform === 'darwin' ? 'dmg' : 'exe';
  const destPath = path.join(app.getPath('temp'), `RemoteSupport-update.${ext}`);
  const lib = downloadUrl.startsWith('https') ? https : http;
  await new Promise((resolve, reject) => {
    lib.get(downloadUrl, { rejectUnauthorized: !allowSelfSigned }, (res) => {
      if (res.statusCode !== 200) { reject(new Error(`Status ${res.statusCode}`)); return; }
      const total = parseInt(res.headers['content-length'], 10) || 0;
      let received = 0;
      if (mainWindow) mainWindow.webContents.send('update-download-progress', { percent: 0, received: 0, total });
      const file = fs.createWriteStream(destPath);
      res.on('data', chunk => {
        received += chunk.length;
        if (mainWindow) mainWindow.webContents.send('update-download-progress', { percent: total ? Math.min(100, Math.round(100 * received / total)) : 0, received, total });
      });
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', reject);
    }).on('error', reject);
  });
  return destPath;
});

ipcMain.handle('helper:install-update-and-quit', async (_event, installerPath) => {
  if (installerPath && fs.existsSync(installerPath)) {
    shell.openPath(installerPath);
    setTimeout(() => app.quit(), 1000);
  }
});

// Shortcut creation (omitted for brevity vs copied from original, simplified)
ipcMain.handle('helper:create-desktop-shortcut', async () => ({ success: false, error: 'Not implemented in this patch' }));

ipcMain.handle('helper:get-capabilities', () => ({
  robotjs: !!robot,
  platform: process.platform,
  displayCount: screen.getAllDisplays().length,
  robotjsError: robotjsError?.message
}));

ipcMain.handle('helper:register-session', async (_event, payload) => {
  const config = readConfig();
  const sessionId = payload.sessionId || config.sessionId;
  currentAllowUnattended = payload.allowUnattended !== false;
  const res = await fetch(`${config.server}/api/sessions/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      clientInfo: { os: `${os.platform()} ${os.release()}`, hostname: os.hostname(), username: os.userInfo().username },
      status: 'connected',
      deviceId: getDeviceId(),
      deviceName: os.hostname(),
      allowUnattended: currentAllowUnattended
    })
  });
  if (!res.ok) throw new Error('Register failed');
  return res.json();
});

async function sendApprovalResponse(sessionId, approved) {
  const config = readConfig();
  const base = config.server.replace(/\/$/, '');
  await fetch(`${base}/api/sessions/${encodeURIComponent(sessionId)}/approval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approved: !!approved })
  });
}

ipcMain.handle('helper:check-pending', async () => {
  const config = readConfig();
  const res = await fetch(`${config.server}/api/devices/pending/${getDeviceId()}`);
  return res.ok ? res.json() : { pending: false };
});

ipcMain.handle('helper:assign-session', async (_event, allowUnattended) => {
  const config = readConfig();
  const res = await fetch(`${config.server}/api/sessions/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId: getDeviceId(),
      deviceName: os.hostname(),
      os: `${os.platform()} ${os.release()}`,
      hostname: os.hostname(),
      arch: os.arch(),
      allowUnattended: allowUnattended !== false,
      macAddress: getMacAddress()
    })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
});

ipcMain.handle('helper:register-device', async (_event, allowUnattended) => {
  const config = readConfig();
  const res = await fetch(`${config.server}/api/devices/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId: getDeviceId(),
      displayName: os.hostname(),
      os: `${os.platform()} ${os.release()}`,
      hostname: os.hostname(),
      arch: os.arch(),
      allowUnattended,
      macAddress: getMacAddress()
    })
  });
  if (!res.ok) throw new Error('Register device failed');
  return res.json();
});

ipcMain.handle('helper:get-sources', async () => {
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 150, height: 150 } });
  return sources.map(s => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL() }));
});

ipcMain.handle('helper:get-display-info', (_event, displayIndex) => {
  const displays = screen.getAllDisplays();
  const d = displays[displayIndex] || screen.getPrimaryDisplay();
  return { width: d.size.width, height: d.size.height, scaleFactor: d.scaleFactor };
});

ipcMain.handle('helper:get-all-displays', () => {
  const primary = screen.getPrimaryDisplay();
  return screen.getAllDisplays().map((d, i) => ({
    index: i, width: d.size.width, height: d.size.height, primary: d.id === primary.id, label: d.label || `Display ${i + 1}`
  }));
});

// Socket connection
ipcMain.handle('helper:socket-connect', async (_event, sessionId) => {
  const config = readConfig();
  let serverUrl = config.server;
  let socketPath = '/socket.io';
  try {
    const url = new URL(config.server);
    if (url.pathname && url.pathname !== '/') {
      serverUrl = `${url.protocol}//${url.host}`;
      socketPath = `${url.pathname}/socket.io`.replace(/\/+/g, '/');
    }
  } catch (_) { }

  return new Promise((resolve, reject) => {
    socket = io(serverUrl, {
      path: socketPath,
      transports: ['websocket', 'polling'],
      rejectUnauthorized: !allowSelfSigned
    });

    socket.on('connect', () => {
      console.log('Connected to signaling server');
      currentSessionId = sessionId;
      chatHistory = [];
      socket.emit('join-session', { sessionId, role: 'helper' });
      resolve({ success: true });
    });

    socket.on('connect_error', (e) => reject(new Error(e.message)));

    socket.on('webrtc-answer', (data) => { if (mainWindow) mainWindow.webContents.send('signaling:webrtc-answer', data); });
    socket.on('webrtc-ice-candidate', (data) => { if (mainWindow) mainWindow.webContents.send('signaling:webrtc-ice-candidate', data); });

    socket.on('peer-joined', (data) => { if (mainWindow) mainWindow.webContents.send('signaling:peer-joined', data); });
    socket.on('technician-joined', (data) => { if (mainWindow) mainWindow.webContents.send('signaling:technician-joined', data); });
    socket.on('technician-left', (data) => { if (mainWindow) mainWindow.webContents.send('signaling:technician-left', data); });
    socket.on('technicians-present', (data) => { if (mainWindow) mainWindow.webContents.send('signaling:technicians-present', data); });

    socket.on('connection-request', async (data) => {
      if (!currentSessionId || String(data?.sessionId || '') !== String(currentSessionId)) return;
      if (mainWindow) mainWindow.webContents.send('signaling:connection-request', data);

      if (currentAllowUnattended) {
        try {
          await sendApprovalResponse(currentSessionId, true);
          if (mainWindow) mainWindow.webContents.send('signaling:connection-response', { sessionId: currentSessionId, approved: true });
        } catch (e) {
          console.error('Auto-approval failed:', e.message);
        }
        return;
      }

      // Manual flow
      try {
        const techName = data?.technicianName || 'Technician';
        const { response } = await dialog.showMessageBox(mainWindow, {
          type: 'question',
          buttons: ['Approve', 'Deny'],
          title: 'Remote Support Request',
          message: `${techName} wants to connect.`,
          detail: `Allow connection?`
        });
        const approved = response === 0;
        await sendApprovalResponse(currentSessionId, approved);
        if (mainWindow) mainWindow.webContents.send('signaling:connection-response', { sessionId: currentSessionId, approved });
      } catch (_) { }
    });

    socket.on('remote-mouse', (data) => {
      injectMouse(data);
    });
    socket.on('remote-keyboard', (data) => {
      if (mainWindow) mainWindow.webContents.send('signaling:remote-keyboard', data);
      injectKeyboard(data);
    });
    socket.on('remote-clipboard', (data) => {
      if (data.text) {
        clipboard.writeText(data.text);
        if (robot) robot.keyTap('v', process.platform === 'darwin' ? ['command'] : ['control']);
      }
    });
    socket.on('switch-monitor', (data) => { if (mainWindow) mainWindow.webContents.send('signaling:switch-monitor', data); });
    socket.on('set-stream-quality', (data) => { if (mainWindow) mainWindow.webContents.send('signaling:set-stream-quality', data); });

    socket.on('chat-message', (data) => {
      chatHistory.push(data);
      if (mainWindow) mainWindow.webContents.send('signaling:chat-message', data);
      if (chatWindow && !chatWindow.isDestroyed()) chatWindow.webContents.send('chat:new-message', data);
    });

    socket.on('file-available', (data) => {
      if (mainWindow && data) {
        const base = readConfig().server.replace(/\/$/, '');
        mainWindow.webContents.send('signaling:file-available', { ...data, downloadUrl: `${base}/api/files/download/${data.id}` });
      }
    });

    // P2P File Browser Listeners
    socket.on('list-remote-dir', (data) => handleListRemoteDir(socket, data));
    socket.on('get-remote-file', (data) => handleGetRemoteFile(socket, data));
    socket.on('put-remote-file', (data) => handlePutRemoteFile(socket, data));

  }); // End socket.on('connect')
});

// --- P2P Helper Functions ---
const safeBase = (() => { try { return fs.realpathSync(os.homedir()); } catch (_) { return path.resolve(os.homedir()); } })();
const safeBaseNorm = process.platform === 'win32' ? safeBase.toLowerCase() : safeBase;
const safeBasePrefix = safeBaseNorm.endsWith(path.sep) ? safeBaseNorm : safeBaseNorm + path.sep;

function isWithinSafeBase(p) {
  const norm = process.platform === 'win32' ? p.toLowerCase() : p;
  return norm === safeBaseNorm || norm.startsWith(safeBasePrefix);
}

function toSafePath(rawPath) {
  if (!rawPath || rawPath === '' || rawPath === '~') return safeBase;
  const normalized = path.normalize(String(rawPath));
  const resolved = path.isAbsolute(normalized) ? path.resolve(normalized) : path.resolve(safeBase, normalized);
  let real = resolved;
  try { real = fs.realpathSync(resolved); } catch (_) { }
  return isWithinSafeBase(real) ? real : safeBase;
}

function handleListRemoteDir(sock, data) {
  const { sessionId, path: rawPath, requestId } = data;
  try {
    const dirPath = toSafePath(rawPath);
    const names = fs.readdirSync(dirPath, { withFileTypes: true });
    const list = names.map((d) => {
      const fullPath = path.join(dirPath, d.name);
      let size = 0, mtime = null;
      try {
        const stat = fs.statSync(fullPath);
        size = stat.size;
        mtime = stat.mtime ? stat.mtime.toISOString() : null;
      } catch (_) { }
      return { name: d.name, path: fullPath, isDirectory: d.isDirectory(), size, mtime };
    });
    sock.emit('list-remote-dir-result', { sessionId, requestId, list });
  } catch (err) {
    sock.emit('list-remote-dir-result', { sessionId, requestId, error: err.message, list: [] });
  }
}

function handleGetRemoteFile(sock, data) {
  const { sessionId, path: filePath, requestId } = data;
  try {
    const safePath = toSafePath(filePath);
    if (fs.statSync(safePath).isDirectory()) {
      sock.emit('get-remote-file-result', { sessionId, requestId, error: 'Cannot download a folder' });
      return;
    }
    const buf = fs.readFileSync(safePath);
    sock.emit('get-remote-file-result', { sessionId, requestId, content: buf.toString('base64'), name: path.basename(safePath) });
  } catch (err) {
    sock.emit('get-remote-file-result', { sessionId, requestId, error: err.message });
  }
}

function handlePutRemoteFile(sock, data) {
  const { sessionId, path: dirPath, filename, content, requestId } = data;
  try {
    const safeDir = toSafePath(dirPath);
    const fullPath = path.join(safeDir, path.basename(filename));
    if (!isWithinSafeBase(path.resolve(fullPath))) throw new Error('Path not allowed');
    fs.writeFileSync(fullPath, Buffer.from(content, 'base64'));
    sock.emit('put-remote-file-result', { sessionId, requestId, success: true });
  } catch (err) {
    sock.emit('put-remote-file-result', { sessionId, requestId, success: false, error: err.message });
  }
}

// --- Top-Level IPC Handlers ---

ipcMain.handle('helper:socket-send-offer', (_event, data) => { if (socket) socket.emit('webrtc-offer', data); });
ipcMain.handle('helper:socket-send-ice', (_event, data) => { if (socket) socket.emit('webrtc-ice-candidate', data); });
ipcMain.handle('helper:socket-emit', (_event, eventName, data) => { if (socket) socket.emit(eventName, data); });
ipcMain.handle('helper:socket-disconnect', () => { if (socket) socket.disconnect(); socket = null; });
ipcMain.on('control-message', (_event, payload) => {
  if (!payload || !payload.type) return;
  if (payload.type === 'mouse' && payload.data) injectMouse(payload.data);
  if (payload.type === 'keyboard' && payload.data) injectKeyboard(payload.data);
});

// Chat Window
ipcMain.handle('helper:open-chat-window', () => {
  if (chatWindow && !chatWindow.isDestroyed()) { chatWindow.show(); chatWindow.focus(); return; }
  chatWindow = new BrowserWindow({ width: 400, height: 500, title: 'Chat', webPreferences: { nodeIntegration: true, contextIsolation: false } });
  chatWindow.loadURL('about:blank'); // Placeholder
});
ipcMain.handle('chat:send-message', async (_event, msg) => {
  if (!socket || !currentSessionId) throw new Error('Not connected');
  const data = { sessionId: currentSessionId, message: msg, role: 'user', timestamp: Date.now() };
  socket.emit('chat-message', data);
  chatHistory.push(data);
  if (chatWindow && !chatWindow.isDestroyed()) chatWindow.webContents.send('chat:new-message', data);
  return { success: true };
});
ipcMain.handle('chat:request-history', () => {
  if (chatWindow && !chatWindow.isDestroyed()) chatWindow.webContents.send('chat:history', chatHistory);
  return { success: true };
});

// File System IPC for Renderer (P2P Manager)
ipcMain.handle('helper:fs-drives', async () => {
  if (process.platform === 'win32') {
    try {
      const stdout = execSync('wmic logicaldisk get name').toString();
      const drives = stdout.split('\r\n').filter(l => l.trim() && l.includes(':')).map(l => ({ path: l.trim() + '\\', name: l.trim(), type: 'drive' }));
      return drives.length ? drives : [{ path: 'C:\\', name: 'C:', type: 'drive' }];
    } catch (_) { return [{ path: 'C:\\', name: 'C:', type: 'drive' }]; }
  } else {
    return [{ path: '/', name: 'Root', type: 'drive' }];
  }
});
ipcMain.handle('helper:fs-list', async (_event, dirPath) => {
  try {
    const dirents = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const items = await Promise.all(dirents.map(async (d) => {
      try {
        const fullPath = path.join(dirPath, d.name);
        const stats = await fs.promises.stat(fullPath);
        return { name: d.name, isDirectory: d.isDirectory(), size: stats.size, mtime: stats.mtimeMs, path: fullPath };
      } catch { return null; }
    }));
    return items.filter(Boolean);
  } catch (e) { throw new Error(e.message); }
});
ipcMain.handle('helper:fs-read-chunk', async (_event, filePath, offset, length) => {
  let fh = null;
  try {
    fh = await fs.promises.open(filePath, 'r');
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buffer, 0, length, offset);
    return bytesRead < length ? buffer.subarray(0, bytesRead) : buffer;
  } catch (e) { throw new Error(e.message); } finally { if (fh) await fh.close(); }
});
ipcMain.handle('helper:fs-write-chunk', async (_event, filePath, data, offset) => {
  let fh = null;
  try {
    if (offset === 0) await fs.promises.writeFile(filePath, data);
    else {
      fh = await fs.promises.open(filePath, 'r+');
      await fh.write(data, 0, data.length, offset);
    }
    return { success: true };
  } catch (e) { throw new Error(e.message); } finally { if (fh) await fh.close(); }
});

ipcMain.handle('helper:file-download', async (_event, url, defaultName) => {
  try {
    const res = await fetch(url, { rejectUnauthorized: !allowSelfSigned });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const buf = await res.arrayBuffer();
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, { defaultPath: defaultName || 'download' });
    if (canceled || !filePath) return { canceled: true };
    fs.writeFileSync(filePath, Buffer.from(buf));
    return { canceled: false, filePath };
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle('helper:file-pick-upload', async (_event, sessionId, serverUrl) => {
  const base = (serverUrl || readConfig().server).replace(/\/$/, '');
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], title: 'Send file to technician' });
  if (canceled || !filePaths?.length) return { canceled: true };
  try {
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', fs.createReadStream(filePaths[0]), path.basename(filePaths[0]));
    form.append('sessionId', sessionId);
    form.append('direction', 'user-to-technician');
    const res = await fetch(`${base}/api/files/upload`, { method: 'POST', body: form, headers: form.getHeaders() });
    if (!res.ok) throw new Error(await res.text());
    return { success: true };
  } catch (e) { return { error: e.message }; }
});
