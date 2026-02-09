const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

class PackageBuilder {
    constructor(serverUrl) {
        this.serverUrl = serverUrl;
        this.packagesDir = path.join(__dirname, '../../packages');
        
        // Ensure packages directory exists
        if (!fs.existsSync(this.packagesDir)) {
            fs.mkdirSync(this.packagesDir, { recursive: true });
        }
    }
    
    async buildPackage(sessionId, technicianId) {
        const packageDir = path.join(this.packagesDir, sessionId);
        
        // Create package directory
        if (!fs.existsSync(packageDir)) {
            fs.mkdirSync(packageDir, { recursive: true });
        }
        
        // Create configuration file
        const config = {
            sessionId,
            server: this.serverUrl,
            port: 5500,
            technicianId,
            createdAt: new Date().toISOString()
        };
        
        fs.writeFileSync(
            path.join(packageDir, 'config.json'),
            JSON.stringify(config, null, 2)
        );
        
        // Create platform-specific scripts
        // Windows scripts
        const windowsLauncher = this.createWindowsLauncher(config);
        fs.writeFileSync(
            path.join(packageDir, 'launch.bat'),
            windowsLauncher
        );
        
        const windowsConnect = this.createWindowsConnect(config);
        fs.writeFileSync(
            path.join(packageDir, 'connect.bat'),
            windowsConnect
        );
        
        const windowsRegister = this.createWindowsRegistration(config);
        fs.writeFileSync(
            path.join(packageDir, 'register-session.ps1'),
            windowsRegister
        );

        const windowsRegisterVbs = this.createWindowsRegistrationVbs(config);
        fs.writeFileSync(
            path.join(packageDir, 'register-session.vbs'),
            windowsRegisterVbs
        );
        
        // macOS/Linux scripts
        const unixLauncher = this.createUnixLauncher(config);
        fs.writeFileSync(
            path.join(packageDir, 'launch.sh'),
            unixLauncher
        );
        // Make executable
        fs.chmodSync(path.join(packageDir, 'launch.sh'), 0o755);
        
        const unixConnect = this.createUnixConnect(config);
        fs.writeFileSync(
            path.join(packageDir, 'connect.sh'),
            unixConnect
        );
        fs.chmodSync(path.join(packageDir, 'connect.sh'), 0o755);
        
        const unixRegister = this.createUnixRegistration(config);
        fs.writeFileSync(
            path.join(packageDir, 'register-session.sh'),
            unixRegister
        );
        fs.chmodSync(path.join(packageDir, 'register-session.sh'), 0o755);
        
        // Universal launcher (detects OS)
        const universalLauncher = this.createUniversalLauncher(config);
        fs.writeFileSync(
            path.join(packageDir, 'start-support'),
            universalLauncher
        );
        fs.chmodSync(path.join(packageDir, 'start-support'), 0o755);
        
        // Create README
        const readme = this.createReadme(config);
        fs.writeFileSync(
            path.join(packageDir, 'README.txt'),
            readme
        );
        
        // Create ZIP package
        const zipPath = await this.createZipPackage(packageDir, sessionId);
        
        return {
            packageId: sessionId,
            file: zipPath,
            config
        };
    }
    
    // Windows launcher (compatible with Windows XP and later)
    createWindowsLauncher(config) {
        return `@echo off
REM Support Helper Launcher for Windows
REM Compatible with Windows XP, Vista, 7, 8, 10, 11

cd /d "%~dp0"

echo ========================================
echo   Remote Support Helper
echo   Session: ${config.sessionId}
echo ========================================
echo.

REM Check if TightVNC exists
if exist "tightvnc\\tvnserver.exe" (
    echo Starting TightVNC Server...
    start "" "tightvnc\\tvnserver.exe"
    REM XP does not have "timeout" by default; use ping as a delay.
    ping -n 4 127.0.0.1 >nul
    call connect.bat
) else (
    echo TightVNC not found in package.
    echo Please ensure TightVNC Portable is included.
    echo.
    echo For manual setup:
    echo 1. Install TightVNC Server
    echo 2. Run: tvnserver.exe -controlapp -connect ${new URL(config.server).hostname}:5500
    pause
    exit /b 1
)

REM Register session (optional, for showing status in dashboard).
REM Prefer PowerShell if available; fall back to VBScript (works on XP).
if exist "%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" (
    echo Registering session (PowerShell)...
    "%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -ExecutionPolicy Bypass -File register-session.ps1
) else if exist "register-session.vbs" (
    echo Registering session (VBScript)...
    cscript //nologo register-session.vbs
) else (
    echo Registration skipped (no PowerShell/VBScript).
    echo Session may still work without registration.
)

echo.
echo ========================================
echo   Support session is ready!
echo   Session ID: ${config.sessionId}
echo   Waiting for technician to connect...
echo ========================================
echo.
echo Keep this window open while receiving support.
echo Press any key to close...
pause >nul
`;
    }
    
    // Windows connect script
    createWindowsConnect(config) {
        const serverHost = new URL(config.server).hostname;
        const serverPort = config.port || 5500;
        return `@echo off
REM Connect TightVNC to server (reverse connection)

cd /d "%~dp0"

if exist "tightvnc\\tvnserver.exe" (
    echo Connecting to ${serverHost}:${serverPort}...
    "tightvnc\\tvnserver.exe" -controlapp -connect ${serverHost}:${serverPort}
    if %ERRORLEVEL% EQU 0 (
        echo Connected successfully!
    ) else (
        echo Connection failed. Please check your internet connection.
    )
) else (
    echo TightVNC not found. Cannot connect.
)
`;
    }
    
    // Windows registration script (PowerShell, compatible with XP SP3+)
    createWindowsRegistration(config) {
        const serverHost = new URL(config.server).host;
        const serverProtocol = new URL(config.server).protocol === 'https:' ? 'https' : 'http';
        return `param(
    [string]$SessionId = "${config.sessionId}",
    [string]$Server = "${serverHost}",
    [string]$Protocol = "${serverProtocol}"
)

# Get OS info (compatible with older PowerShell versions)
try {
    $os = Get-WmiObject Win32_OperatingSystem -ErrorAction Stop
    $osName = $os.Caption
    $osVersion = $os.Version
} catch {
    # Fallback for very old systems
    $osName = "Windows"
    $osVersion = $PSVersionTable.PSVersion.ToString()
}

$clientInfo = @{
    os = "$osName ($osVersion)"
    arch = $env:PROCESSOR_ARCHITECTURE
    hostname = $env:COMPUTERNAME
    username = $env:USERNAME
}

$deviceDir = Join-Path $env:APPDATA "RemoteSupport"
$deviceFile = Join-Path $deviceDir "device_id.txt"
if (!(Test-Path $deviceDir)) { New-Item -ItemType Directory -Path $deviceDir | Out-Null }
if (Test-Path $deviceFile) {
    $deviceId = Get-Content $deviceFile -ErrorAction SilentlyContinue
} else {
    $deviceId = [guid]::NewGuid().ToString()
    $deviceId | Out-File -FilePath $deviceFile -Encoding ascii
}

# Escape JSON string values (PowerShell 2 compatible, no ConvertTo-Json required)
function Escape-Json([string]$s) {
    if ($s -eq $null) { return "" }
    $s = $s -replace '\\\\', '\\\\\\\\'
    $s = $s -replace '\"', '\\\\\"'
    $s = $s -replace \"\\r\", \"\\\\r\"
    $s = $s -replace \"\\n\", \"\\\\n\"
    $s = $s -replace \"\\t\", \"\\\\t\"
    return $s
}

# Simple HTTP helpers (PowerShell 2 compatible: no Invoke-RestMethod)
function Http-Get([string]$url) {
    $wc = New-Object System.Net.WebClient
    $wc.Headers['User-Agent'] = 'RemoteSupport-Helper'
    return $wc.DownloadString($url)
}

function Http-PostJson([string]$url, [string]$json) {
    $wc = New-Object System.Net.WebClient
    $wc.Headers['User-Agent'] = 'RemoteSupport-Helper'
    $wc.Headers['Content-Type'] = 'application/json'
    return $wc.UploadString($url, 'POST', $json)
}

# Check for pending session
try {
    $pendingJson = Http-Get "$Protocol://$Server/api/devices/pending/$deviceId"
    if ($pendingJson -match '\"pending\"\\s*:\\s*true' -and $pendingJson -match '\"sessionId\"\\s*:\\s*\"([^\"]+)\"') {
        $SessionId = $matches[1]
    }
} catch {
    # Ignore pending lookup errors
}

$body = "{""sessionId"":""$(Escape-Json $SessionId)"",""clientInfo"":{""os"":""$(Escape-Json $clientInfo.os)"",""arch"":""$(Escape-Json $clientInfo.arch)"",""hostname"":""$(Escape-Json $clientInfo.hostname)"",""username"":""$(Escape-Json $clientInfo.username)""},""vncPort"":5900,""status"":""connected"",""deviceId"":""$(Escape-Json $deviceId)"",""deviceName"":""$(Escape-Json $env:COMPUTERNAME)""}"

try {
    $uri = "$Protocol" + "://" + "$Server/api/sessions/register"
    $response = Http-PostJson $uri $body
    
    Write-Host "Session registered successfully!" -ForegroundColor Green
    Write-Host "Session ID: $SessionId" -ForegroundColor Cyan
} catch {
    Write-Host "Registration error: $_" -ForegroundColor Yellow
    Write-Host "Session may still work, but registration failed." -ForegroundColor Yellow
}
`;
    }

    // Windows registration script (VBScript) for XP (no PowerShell required)
    createWindowsRegistrationVbs(config) {
        const serverHost = new URL(config.server).host;
        const serverProtocol = new URL(config.server).protocol === 'https:' ? 'https' : 'http';
        // Note: VBScript uses very simple JSON parsing; registration is best-effort.
        return `' Remote Support Helper registration (VBScript; works on Windows XP)
Option Explicit

Dim SessionId, Server, Protocol
SessionId = "${config.sessionId}"
Server = "${serverHost}"
Protocol = "${serverProtocol}"

Dim appData, deviceDir, deviceFile, deviceId
appData = CreateObject("WScript.Shell").ExpandEnvironmentStrings("%APPDATA%")
If Len(appData) = 0 Then appData = CreateObject("WScript.Shell").ExpandEnvironmentStrings("%USERPROFILE%") & "\\Application Data"
deviceDir = appData & "\\RemoteSupport"
deviceFile = deviceDir & "\\device_id.txt"

Dim fso: Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FolderExists(deviceDir) Then fso.CreateFolder(deviceDir)

If fso.FileExists(deviceFile) Then
  deviceId = Trim(ReadAllText(deviceFile))
Else
  deviceId = Replace(Replace(CreateObject("Scriptlet.TypeLib").Guid, "{", ""), "}", "")
  WriteAllText deviceFile, deviceId
End If

' Check pending session
On Error Resume Next
Dim pendingJson: pendingJson = HttpGet(Protocol & "://" & Server & "/api/devices/pending/" & deviceId)
If InStr(1, pendingJson, """pending"":true", vbTextCompare) > 0 Then
  Dim psid: psid = JsonGetString(pendingJson, "sessionId")
  If Len(psid) > 0 Then SessionId = psid
End If
On Error GoTo 0

Dim osName, osVer, arch, host, user
osName = "Windows"
osVer = ""
arch = CreateObject("WScript.Shell").ExpandEnvironmentStrings("%PROCESSOR_ARCHITECTURE%")
host = CreateObject("WScript.Shell").ExpandEnvironmentStrings("%COMPUTERNAME%")
user = CreateObject("WScript.Shell").ExpandEnvironmentStrings("%USERNAME%")

Dim payload
payload = "{""sessionId"":""" & EscapeJson(SessionId) & """,""clientInfo"":{""os"":""" & EscapeJson(osName) & """,""arch"":""" & EscapeJson(arch) & """,""hostname"":""" & EscapeJson(host) & """,""username"":""" & EscapeJson(user) & """},""vncPort"":5900,""status"":""connected"",""deviceId"":""" & EscapeJson(deviceId) & """,""deviceName"":""" & EscapeJson(host) & """}"

On Error Resume Next
Call HttpPostJson(Protocol & "://" & Server & "/api/sessions/register", payload)
On Error GoTo 0

Sub WriteAllText(path, text)
  Dim ts: Set ts = fso.OpenTextFile(path, 2, True)
  ts.Write text
  ts.Close
End Sub

Function ReadAllText(path)
  Dim ts: Set ts = fso.OpenTextFile(path, 1, False)
  ReadAllText = ts.ReadAll
  ts.Close
End Function

Function EscapeJson(s)
  Dim t: t = s
  t = Replace(t, "\\", "\\\\")
  t = Replace(t, """", "\\\"")
  t = Replace(t, vbCr, "\\r")
  t = Replace(t, vbLf, "\\n")
  t = Replace(t, vbTab, "\\t")
  EscapeJson = t
End Function

Function HttpGet(url)
  Dim x: Set x = CreateObject("MSXML2.XMLHTTP")
  x.Open "GET", url, False
  x.Send
  HttpGet = x.responseText
End Function

Sub HttpPostJson(url, json)
  Dim x: Set x = CreateObject("MSXML2.XMLHTTP")
  x.Open "POST", url, False
  x.setRequestHeader "Content-Type", "application/json"
  x.Send json
End Sub

Function JsonGetString(json, key)
  ' Very small extractor for: "key":"value"
  Dim pat, p, startPos, endPos
  pat = """" & key & """:"""
  p = InStr(1, json, pat, vbTextCompare)
  If p = 0 Then JsonGetString = "" : Exit Function
  startPos = p + Len(pat)
  endPos = InStr(startPos, json, """")
  If endPos = 0 Then JsonGetString = "" : Exit Function
  JsonGetString = Mid(json, startPos, endPos - startPos)
End Function
`;
    }
    
    // Unix launcher (macOS/Linux)
    createUnixLauncher(config) {
        return `#!/bin/bash
# Support Helper Launcher for macOS and Linux

cd "$(dirname "$0")"

SESSION_ID="${config.sessionId}"
SERVER_HOST="${new URL(config.server).host}"
SERVER_PORT=${config.port || 5500}

echo "========================================"
echo "  Remote Support Helper"
echo "  Session: $SESSION_ID"
echo "========================================"
echo ""

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macOS"
    echo "Detected: macOS"
    echo ""
    
    # Check if Screen Sharing is enabled
    SCREEN_SHARING_ENABLED=$(defaults read /Library/Preferences/com.apple.RemoteManagement.plist ARD_AllLocalUsers 2>/dev/null || echo "")
    VNC_ENABLED=$(launchctl list | grep -i vnc || echo "")
    
    echo "macOS uses built-in Screen Sharing (VNC)."
    echo ""
    
    # Try to enable Screen Sharing programmatically (requires admin)
    if [ -w /System/Library/CoreServices/RemoteManagement/ARDAgent.app/Contents/Resources/kickstart ]; then
        echo "Attempting to enable Screen Sharing..."
        sudo /System/Library/CoreServices/RemoteManagement/ARDAgent.app/Contents/Resources/kickstart -activate -configure -access -on -restart -agent -privs -all || true
    fi
    
    echo "To enable Screen Sharing manually:"
    echo "  1. Open System Preferences"
    echo "  2. Go to Sharing"
    echo "  3. Check 'Screen Sharing'"
    echo ""
    echo "Or run this command (requires admin password):"
    echo "  sudo /System/Library/CoreServices/RemoteManagement/ARDAgent.app/Contents/Resources/kickstart -activate -configure -access -on -restart -agent -privs -all"
    echo ""
    echo "Screen Sharing will run on port 5900"
    echo ""
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="Linux"
    echo "Detected: Linux"
    echo ""
    
    # Check for common VNC servers
    if command -v vncserver &> /dev/null; then
        echo "Found: TigerVNC"
        ./connect.sh
    elif command -v x11vnc &> /dev/null; then
        echo "Found: x11vnc"
        echo "Starting x11vnc..."
        x11vnc -display :0 -nopw -forever -shared -rfbport 5900 &
        sleep 2
        ./connect.sh
    else
        echo "No VNC server found. Please install one:"
        echo "  Ubuntu/Debian: sudo apt-get install tigervnc-standalone-server"
        echo "  Fedora/RHEL: sudo dnf install tigervnc-server"
        echo "  Arch: sudo pacman -S tigervnc"
        exit 1
    fi
else
    echo "Unsupported OS: $OSTYPE"
    exit 1
fi

# Register session
./register-session.sh

echo ""
echo "========================================"
echo "  Support session is ready!"
echo "  Session ID: $SESSION_ID"
echo "  Waiting for technician to connect..."
echo "========================================"
echo ""
echo "Keep this terminal open while receiving support."
echo "Press Ctrl+C to stop."
`;
    }
    
    // Unix connect script
    createUnixConnect(config) {
        const serverHost = new URL(config.server).hostname;
        const serverPort = config.port || 5500;
        return `#!/bin/bash
# Connect VNC to server (reverse connection)

cd "$(dirname "$0")"

SERVER_HOST="${serverHost}"
SERVER_PORT=${serverPort}

echo "Connecting to $SERVER_HOST:$SERVER_PORT..."

# For macOS, use built-in VNC reverse connection
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "macOS: Please ensure Screen Sharing is enabled"
    echo "The technician will connect via the server bridge."
    echo "Session registered. Waiting for connection..."
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Try to connect using vncviewer in listen mode or similar
    echo "Linux: VNC server should be running on port 5900"
    echo "The technician will connect via the server bridge."
    echo "Session registered. Waiting for connection..."
fi
`;
    }
    
    // Unix registration script
    createUnixRegistration(config) {
        const serverHost = new URL(config.server).host;
        const serverProtocol = new URL(config.server).protocol === 'https:' ? 'https' : 'http';
        return `#!/bin/bash
# Register session with server

cd "$(dirname "$0")"

SESSION_ID="${config.sessionId}"
SERVER_HOST="${serverHost}"
SERVER_PROTOCOL="${serverProtocol}"

DEVICE_DIR="$HOME/.remote-support"
DEVICE_FILE="$DEVICE_DIR/device_id"
mkdir -p "$DEVICE_DIR"
if [ -f "$DEVICE_FILE" ]; then
    DEVICE_ID=$(cat "$DEVICE_FILE")
else
    DEVICE_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)
    echo "$DEVICE_ID" > "$DEVICE_FILE"
fi

# Check for pending session
PENDING_JSON=$(curl -s "$SERVER_PROTOCOL://$SERVER_HOST/api/devices/pending/$DEVICE_ID")
PENDING_SESSION=$(echo "$PENDING_JSON" | sed -n 's/.*"sessionId"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p')
if echo "$PENDING_JSON" | grep -q '"pending"[[:space:]]*:[[:space:]]*true'; then
    if [ -n "$PENDING_SESSION" ]; then
        SESSION_ID="$PENDING_SESSION"
    fi
fi

# Detect OS and architecture
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS_NAME="macOS"
    OS_VERSION=$(sw_vers -productVersion)
    ARCH=$(uname -m)
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS_NAME=$(lsb_release -si 2>/dev/null || echo "Linux")
    OS_VERSION=$(lsb_release -sr 2>/dev/null || uname -r)
    ARCH=$(uname -m)
else
    OS_NAME="Unix"
    OS_VERSION=$(uname -r)
    ARCH=$(uname -m)
fi

HOSTNAME=$(hostname)
USERNAME=$(whoami)

# Create JSON payload
CLIENT_INFO=$(cat <<EOF
{
    "sessionId": "$SESSION_ID",
    "clientInfo": {
        "os": "$OS_NAME $OS_VERSION",
        "arch": "$ARCH",
        "hostname": "$HOSTNAME",
        "username": "$USERNAME"
    },
    "vncPort": 5900,
    "status": "connected",
    "deviceId": "$DEVICE_ID",
    "deviceName": "$HOSTNAME"
}
EOF
)

# Register with server
if command -v curl &> /dev/null; then
    echo "Registering session with server..."
    HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/register_response.json -X POST \\
        "$SERVER_PROTOCOL://$SERVER_HOST/api/sessions/register" \\
        -H "Content-Type: application/json" \\
        -d "$CLIENT_INFO" 2>&1)
    
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
        echo "✓ Session registered successfully!"
        echo "  Session ID: $SESSION_ID"
        if [ -f /tmp/register_response.json ]; then
            cat /tmp/register_response.json
            rm -f /tmp/register_response.json
        fi
    else
        echo "⚠ Registration failed (HTTP $HTTP_CODE)"
        if [ -f /tmp/register_response.json ]; then
            echo "  Response: $(cat /tmp/register_response.json)"
            rm -f /tmp/register_response.json
        fi
        echo "  Attempted to connect to: $SERVER_PROTOCOL://$SERVER_HOST"
        if [ "$SERVER_HOST" = "localhost" ] || [ "$SERVER_HOST" = "127.0.0.1" ]; then
            echo ""
            echo "  ⚠️  WARNING: Server URL is set to localhost!"
            echo "  This won't work from remote machines."
            echo "  For testing, use your server's IP address instead."
            echo "  Example: http://192.168.1.100:3000"
        fi
        echo "  Session may still work, but technician won't see connection status"
    fi
elif command -v wget &> /dev/null; then
    echo "Registering session with server..."
    echo "$CLIENT_INFO" | wget --quiet --post-data=- --header="Content-Type: application/json" \\
        "$SERVER_PROTOCOL://$SERVER_HOST/api/sessions/register" -O /tmp/register_response.json 2>&1
    if [ $? -eq 0 ]; then
        echo "✓ Session registration attempted"
        if [ -f /tmp/register_response.json ]; then
            cat /tmp/register_response.json
            rm -f /tmp/register_response.json
        fi
    else
        echo "⚠ Registration failed"
        echo "  Server: $SERVER_PROTOCOL://$SERVER_HOST"
    fi
else
    echo "⚠ curl or wget not found. Registration skipped."
    echo "  Please install curl: brew install curl (macOS) or apt-get install curl (Linux)"
fi
`;
    }
    
    // Universal launcher that detects OS
    createUniversalLauncher(config) {
        return `#!/bin/bash
# Universal Support Helper Launcher
# Auto-detects OS and runs appropriate script

cd "$(dirname "$0")"

if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]] || [[ -n "$WINDIR" ]]; then
    # Windows
    if [ -f "launch.bat" ]; then
        cmd.exe /c launch.bat
    else
        echo "Error: launch.bat not found"
        exit 1
    fi
elif [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    if [ -f "launch.sh" ]; then
        bash launch.sh
    else
        echo "Error: launch.sh not found"
        exit 1
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    if [ -f "launch.sh" ]; then
        bash launch.sh
    else
        echo "Error: launch.sh not found"
        exit 1
    fi
else
    echo "Unsupported operating system: $OSTYPE"
    echo "Please run the appropriate script manually:"
    echo "  Windows: launch.bat"
    echo "  macOS/Linux: bash launch.sh"
    exit 1
fi
`;
    }
    
    createReadme(config) {
        return `Remote Support Helper
====================

Session ID: ${config.sessionId}

PLATFORM-SPECIFIC INSTRUCTIONS:

Windows (XP, Vista, 7, 8, 10, 11):
  1. Double-click "launch.bat" to start
  2. Or run: start-support (auto-detects Windows)
  3. Keep the window open while receiving support

macOS:
  1. Open Terminal
  2. Navigate to this folder: cd /path/to/extracted/folder
  3. Run: bash launch.sh
  4. Or run: ./start-support
  5. Enable Screen Sharing if prompted:
     System Preferences > Sharing > Screen Sharing

Linux:
  1. Open Terminal
  2. Navigate to this folder: cd /path/to/extracted/folder
  3. Run: bash launch.sh
  4. Or run: ./start-support
  5. Install VNC server if needed:
     Ubuntu/Debian: sudo apt-get install tigervnc-standalone-server
     Fedora/RHEL: sudo dnf install tigervnc-server

Universal (Auto-detect):
  Run: ./start-support
  This will automatically detect your OS and run the correct script.

IMPORTANT:
- Keep the terminal/window open while receiving support
- Do not close until the technician is done
- Session ID: ${config.sessionId}

For support, contact your technician.
`;
    }
    
    async createZipPackage(packageDir, sessionId) {
        const zipPath = path.join(this.packagesDir, `support-${sessionId}.zip`);
        
        return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(zipPath);
            const archive = archiver('zip', { zlib: { level: 9 } });
            
            output.on('close', () => {
                resolve(zipPath);
            });
            
            archive.on('error', reject);
            archive.pipe(output);
            archive.directory(packageDir, false);
            archive.finalize();
        });
    }
    
    async getPackagePath(sessionId, type = 'zip') {
        const normalized = type.toLowerCase();
        const extension = this.getExtension(normalized);
        const filePath = path.join(this.packagesDir, `support-${sessionId}.${extension}`);

        if (fs.existsSync(filePath)) {
            return filePath;
        }

        if (normalized === 'exe' || normalized === 'dmg') {
            const ensured = this.ensureSessionBinary(sessionId, normalized);
            if (ensured && fs.existsSync(filePath)) {
                return filePath;
            }
        }

        return null;
    }

    getDownloadName(sessionId, type = 'zip') {
        const extension = this.getExtension(type);
        return `support-helper-${sessionId}.${extension}`;
    }

    getExtension(type) {
        switch (type) {
            case 'exe':
                return 'exe';
            case 'dmg':
                return 'dmg';
            case 'zip':
            default:
                return 'zip';
        }
    }

    async getPackageManifest(sessionId) {
        const variants = [
            { type: 'exe', label: 'Windows Helper (EXE)' },
            { type: 'dmg', label: 'macOS Helper (DMG)' },
            { type: 'zip', label: 'Universal ZIP (Fallback/XP)' }
        ];

        const packages = [];
        for (const variant of variants) {
            const path = await this.getPackagePath(sessionId, variant.type);
            const available = !!path;
            const size = available ? fs.statSync(path).size : null;
            packages.push({
                type: variant.type,
                label: variant.label,
                available,
                size,
                downloadUrl: `/api/packages/download/${sessionId}?type=${variant.type}`
            });
        }

        return packages;
    }

    getTemplatePath(type) {
        const normalized = type.toLowerCase();
        const envKey = normalized === 'exe' ? 'SUPPORT_TEMPLATE_EXE' : 'SUPPORT_TEMPLATE_DMG';
        const envPath = process.env[envKey];

        if (envPath) {
            return path.isAbsolute(envPath) ? envPath : path.resolve(envPath);
        }

        const extension = this.getExtension(normalized);
        return path.join(this.packagesDir, `support-template.${extension}`);
    }

    getSessionBinaryPath(sessionId, type) {
        const extension = this.getExtension(type);
        return path.join(this.packagesDir, `support-${sessionId}.${extension}`);
    }

    ensureSessionBinary(sessionId, type) {
        const normalized = type.toLowerCase();
        if (normalized !== 'exe' && normalized !== 'dmg') {
            return false;
        }

        const targetPath = this.getSessionBinaryPath(sessionId, normalized);
        if (fs.existsSync(targetPath)) {
            return true;
        }

        const templatePath = this.getTemplatePath(normalized);
        if (!templatePath || !fs.existsSync(templatePath)) {
            return false;
        }

        fs.copyFileSync(templatePath, targetPath);
        return true;
    }

    ensureSessionBinaries(sessionId) {
        return {
            exe: this.ensureSessionBinary(sessionId, 'exe'),
            dmg: this.ensureSessionBinary(sessionId, 'dmg')
        };
    }
}

module.exports = PackageBuilder;
