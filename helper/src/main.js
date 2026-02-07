const { app, BrowserWindow, ipcMain, desktopCapturer, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { io } = require('socket.io-client');

let robot = null;
try {
  robot = require('robotjs');
} catch (e) {
  console.warn('robotjs not available (remote control disabled):', e.message);
}

// Allow self-signed SSL certificates (for development/testing)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

let mainWindow;
let socket = null;

const MOUSE_BUTTONS = ['left', 'middle', 'right'];

function injectMouse(data) {
  if (!robot) return;
  try {
    const bounds = screen.getPrimaryDisplay().bounds;
    const x = Math.round(bounds.x + data.x * bounds.width);
    const y = Math.round(bounds.y + data.y * bounds.height);
    if (data.type === 'mousemove') {
      robot.moveMouse(x, y);
    } else if (data.type === 'mousedown' || data.type === 'mouseup') {
      const btn = MOUSE_BUTTONS[data.button] || 'left';
      if (btn === 'middle' && !robot.mouseToggle) return;
      robot.moveMouse(x, y);
      robot.mouseToggle(data.type === 'mousedown' ? 'down' : 'up', btn);
    }
  } catch (e) {
    console.warn('Mouse injection error:', e.message);
  }
}

function injectKeyboard(data) {
  if (!robot) return;
  try {
    const mods = [];
    if (data.ctrlKey) mods.push('control');
    if (data.shiftKey) mods.push('shift');
    if (data.altKey) mods.push('alt');
    if (data.metaKey) mods.push('command');
    const key = data.key && data.key.length === 1 ? data.key.toLowerCase() : (data.key || data.code || '').toLowerCase();
    const down = data.type === 'keydown' ? 'down' : 'up';
    if (!key) return;
    robot.keyToggle(key, down, mods.length ? mods : undefined);
  } catch (e) {
    console.warn('Keyboard injection error:', e.message);
  }
}

function getAppDataDir() {
  const base =
    process.platform === 'win32'
      ? process.env.APPDATA
      : process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Application Support')
        : path.join(os.homedir(), '.remote-support');
  return path.join(base, 'RemoteSupport');
}

function getDeviceId() {
  const dir = getAppDataDir();
  const file = path.join(dir, 'device_id.txt');
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(file)) {
    return fs.readFileSync(file, 'utf8').trim();
  }
  const id = require('crypto').randomUUID();
  fs.writeFileSync(file, id);
  return id;
}

function readConfig() {
  const configPath = path.join(process.resourcesPath, 'config.json');
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  // Placeholder gets replaced by server when downloading
  // Server replaces ___SESSID___ with session ID padded to 12 chars
  const embeddedId = '___SESSID___';
  let sessionId = '';
  if (!embeddedId.startsWith('___')) {
    // Remove trailing underscores used for padding
    sessionId = embeddedId.replace(/_+$/, '');
  }
  return {
    sessionId,
    server: 'https://173.249.10.40:8460',
    port: 5500
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 520,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

ipcMain.handle('helper:get-info', () => {
  return {
    deviceId: getDeviceId(),
    config: readConfig(),
    platform: process.platform,
    hostname: os.hostname(),
    arch: os.arch()
  };
});

ipcMain.handle('helper:get-version', () => app.getVersion());

ipcMain.handle('helper:get-capabilities', () => ({
  robotjs: !!robot,
  platform: process.platform
}));

ipcMain.handle('helper:register-session', async (_event, payload) => {
  const deviceId = getDeviceId();
  const config = readConfig();
  const sessionId = payload.sessionId || config.sessionId;
  const allowUnattended = payload.allowUnattended;

  const body = {
    sessionId,
    clientInfo: {
      os: `${os.platform()} ${os.release()}`,
      arch: os.arch(),
      hostname: os.hostname(),
      username: os.userInfo().username
    },
    vncPort: 5900,
    status: 'connected',
    deviceId,
    deviceName: os.hostname(),
    allowUnattended
  };

  const res = await fetch(`${config.server}/api/sessions/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error(`Register failed (${res.status})`);
  }

  return res.json();
});

ipcMain.handle('helper:check-pending', async () => {
  const config = readConfig();
  const deviceId = getDeviceId();
  const res = await fetch(`${config.server}/api/devices/pending/${deviceId}`);
  if (!res.ok) {
    return { pending: false };
  }
  return res.json();
});

// Request a session from the server (same device → same session, new device → new session)
ipcMain.handle('helper:assign-session', async (_event, allowUnattended) => {
  const config = readConfig();
  const deviceId = getDeviceId();
  const base = config.server.replace(/\/$/, '');
  const res = await fetch(`${base}/api/sessions/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId,
      deviceName: os.hostname(),
      os: `${os.platform()} ${os.release()}`,
      hostname: os.hostname(),
      arch: os.arch(),
      allowUnattended: allowUnattended !== false
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Assign session failed (${res.status}): ${err}`);
  }
  return res.json();
});

ipcMain.handle('helper:register-device', async (allowUnattended) => {
  const config = readConfig();
  const deviceId = getDeviceId();
  const res = await fetch(`${config.server}/api/devices/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId,
      displayName: os.hostname(),
      os: `${os.platform()} ${os.release()}`,
      hostname: os.hostname(),
      arch: os.arch(),
      allowUnattended
    })
  });
  if (!res.ok) {
    throw new Error(`Device register failed (${res.status})`);
  }
  return res.json();
});

// Get available screen sources for capture
ipcMain.handle('helper:get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 150, height: 150 }
  });
  return sources.map(source => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL()
  }));
});

// Get display info (primary by default, or by index for multi-monitor)
ipcMain.handle('helper:get-display-info', (_event, displayIndex) => {
  const displays = screen.getAllDisplays();
  const display = displayIndex != null && displays[displayIndex]
    ? displays[displayIndex]
    : screen.getPrimaryDisplay();
  return {
    width: display.size.width,
    height: display.size.height,
    scaleFactor: display.scaleFactor
  };
});

// Get all displays for monitor selection (multi-monitor)
ipcMain.handle('helper:get-all-displays', () => {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  return displays.map((d, index) => ({
    index,
    width: d.size.width,
    height: d.size.height,
    primary: d.id === primary.id,
    label: d.label || `Display ${index + 1}`
  }));
});

// Simulate mouse events (for remote control)
ipcMain.handle('helper:mouse-event', async (_event, data) => {
  // This requires robotjs or similar - placeholder for now
  // In production, use robotjs: robot.moveMouse(x, y); robot.mouseClick();
  console.log('Mouse event:', data);
  return { success: true };
});

// Simulate keyboard events (for remote control)
ipcMain.handle('helper:keyboard-event', async (_event, data) => {
  // This requires robotjs or similar - placeholder for now
  console.log('Keyboard event:', data);
  return { success: true };
});

// Socket.io signaling - connect to server
ipcMain.handle('helper:socket-connect', async (_event, sessionId) => {
  const config = readConfig();

  return new Promise((resolve, reject) => {
    socket = io(config.server, {
      transports: ['websocket', 'polling'],
      rejectUnauthorized: false
    });

    socket.on('connect', () => {
      console.log('Connected to signaling server');
      socket.emit('join-session', { sessionId, role: 'helper' });
      resolve({ success: true });
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
      reject(new Error(error.message));
    });

    // Forward WebRTC signaling events to renderer
    socket.on('webrtc-answer', (data) => {
      console.log('Received WebRTC answer');
      if (mainWindow) {
        mainWindow.webContents.send('signaling:webrtc-answer', data);
      }
    });

    socket.on('webrtc-ice-candidate', (data) => {
      console.log('Received ICE candidate');
      if (mainWindow) {
        mainWindow.webContents.send('signaling:webrtc-ice-candidate', data);
      }
    });

    socket.on('peer-joined', (data) => {
      console.log('Peer joined:', data.role);
      if (mainWindow) {
        mainWindow.webContents.send('signaling:peer-joined', data);
      }
    });

    socket.on('remote-mouse', (data) => {
      injectMouse(data);
    });

    socket.on('remote-keyboard', (data) => {
      injectKeyboard(data);
    });

    socket.on('switch-monitor', (data) => {
      console.log('Switch monitor request:', data);
      if (mainWindow) {
        mainWindow.webContents.send('signaling:switch-monitor', data);
      }
    });

    socket.on('set-stream-quality', (data) => {
      if (mainWindow) {
        mainWindow.webContents.send('signaling:set-stream-quality', data);
      }
    });

    socket.on('chat-message', (data) => {
      if (mainWindow) {
        mainWindow.webContents.send('signaling:chat-message', data);
      }
    });

    socket.on('file-available', (data) => {
      if (mainWindow && data) {
        const base = readConfig().server.replace(/\/$/, '');
        mainWindow.webContents.send('signaling:file-available', {
          ...data,
          downloadUrl: data.downloadUrl || `${base}/api/files/download/${data.id}`
        });
      }
    });

    // Remote file browser: list directory on user's machine (restricted to homedir)
    const safeBase = path.resolve(os.homedir());
    function toSafePath(rawPath) {
      if (!rawPath || rawPath === '' || rawPath === '~') return safeBase;
      const normalized = path.normalize(rawPath).replace(/^(\.\.(\/|\\))+/, '');
      const resolved = path.isAbsolute(normalized) ? path.resolve(normalized) : path.resolve(safeBase, normalized);
      return resolved.startsWith(safeBase) ? resolved : safeBase;
    }

    socket.on('list-remote-dir', (data) => {
      const { sessionId, path: rawPath, requestId } = data;
      try {
        const dirPath = toSafePath(rawPath);
        const names = fs.readdirSync(dirPath, { withFileTypes: true });
        const list = names.map((d) => {
          const fullPath = path.join(dirPath, d.name);
          let size = 0;
          let mtime = null;
          try {
            const stat = fs.statSync(fullPath);
            size = stat.size;
            mtime = stat.mtime ? stat.mtime.toISOString() : null;
          } catch (_) {}
          return {
            name: d.name,
            path: fullPath,
            isDirectory: d.isDirectory(),
            size,
            mtime
          };
        });
        socket.emit('list-remote-dir-result', { sessionId, requestId, list });
      } catch (err) {
        socket.emit('list-remote-dir-result', { sessionId, requestId, error: err.message, list: [] });
      }
    });

    socket.on('get-remote-file', (data) => {
      const { sessionId, path: filePath, requestId } = data;
      try {
        const safePath = toSafePath(filePath);
        if (fs.statSync(safePath).isDirectory()) {
          socket.emit('get-remote-file-result', { sessionId, requestId, error: 'Cannot download a folder' });
          return;
        }
        const buf = fs.readFileSync(safePath);
        const content = buf.toString('base64');
        socket.emit('get-remote-file-result', { sessionId, requestId, content, name: path.basename(safePath) });
      } catch (err) {
        socket.emit('get-remote-file-result', { sessionId, requestId, error: err.message });
      }
    });

    socket.on('put-remote-file', (data) => {
      const { sessionId, path: dirPath, filename, content, requestId } = data;
      try {
        const safeDir = toSafePath(dirPath);
        const fullPath = path.join(safeDir, path.basename(filename));
        if (!fullPath.startsWith(safeBase)) {
          throw new Error('Path not allowed');
        }
        const buf = Buffer.from(content, 'base64');
        fs.writeFileSync(fullPath, buf);
        socket.emit('put-remote-file-result', { sessionId, requestId, success: true });
      } catch (err) {
        socket.emit('put-remote-file-result', { sessionId, requestId, success: false, error: err.message });
      }
    });
  });
});

const { dialog } = require('electron');

ipcMain.handle('helper:file-download', async (_event, url, defaultName) => {
  try {
    const res = await fetch(url, { rejectUnauthorized: false });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const buf = await res.arrayBuffer();
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName || 'download'
    });
    if (canceled || !filePath) return { canceled: true };
    fs.writeFileSync(filePath, Buffer.from(buf));
    return { canceled: false, filePath };
  } catch (e) {
    console.error('File download error:', e);
    return { error: e.message };
  }
});

ipcMain.handle('helper:file-pick-upload', async (_event, sessionId, serverUrl) => {
  const base = (serverUrl || readConfig().server).replace(/\/$/, '');
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Send file to technician'
  });
  if (canceled || !filePaths?.length) return { canceled: true };
  try {
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', fs.createReadStream(filePaths[0]), path.basename(filePaths[0]));
    form.append('sessionId', sessionId);
    form.append('direction', 'user-to-technician');
    const res = await fetch(`${base}/api/files/upload`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    if (!res.ok) throw new Error(await res.text());
    return { success: true };
  } catch (e) {
    console.error('File upload error:', e);
    return { error: e.message };
  }
});

// Send WebRTC offer
ipcMain.handle('helper:socket-send-offer', async (_event, data) => {
  if (socket) {
    socket.emit('webrtc-offer', data);
    return { success: true };
  }
  throw new Error('Socket not connected');
});

// Send ICE candidate
ipcMain.handle('helper:socket-send-ice', async (_event, data) => {
  if (socket) {
    socket.emit('webrtc-ice-candidate', data);
    return { success: true };
  }
  throw new Error('Socket not connected');
});

// Generic socket emit (for capability reporting, etc.)
ipcMain.handle('helper:socket-emit', async (_event, eventName, data) => {
  if (socket) {
    socket.emit(eventName, data);
    return { success: true };
  }
  throw new Error('Socket not connected');
});

// Disconnect socket
ipcMain.handle('helper:socket-disconnect', async () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  return { success: true };
});
