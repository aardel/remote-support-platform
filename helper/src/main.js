const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

let mainWindow;

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
  return {
    sessionId: '',
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

ipcMain.handle('helper:start-vnc', async () => {
  // Phase 1 placeholder: TightVNC should be bundled and launched here.
  // In production, start tvnserver.exe and reverse-connect to server.
  const config = readConfig();
  const vncPath = path.join(process.resourcesPath, 'tightvnc', 'tvnserver.exe');
  if (process.platform === 'win32' && fs.existsSync(vncPath)) {
    execFile(vncPath, ['-controlapp', '-connect', `${new URL(config.server).hostname}:${config.port || 5500}`]);
    return { started: true };
  }
  return { started: false, message: 'VNC not bundled yet' };
});
