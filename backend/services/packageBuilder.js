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
    
    buildServerConfig(sessionId, technicianId) {
        // serverBase is the full URL including any path prefix (e.g. https://backup.servicelc.com/remote)
        const serverBase = this.serverUrl.replace(/\/$/, '');
        const parsedServer = new URL(serverBase);
        const serverHostname = parsedServer.hostname;
        const serverPathPrefix = parsedServer.pathname && parsedServer.pathname !== '/'
            ? parsedServer.pathname.replace(/\/$/, '')
            : '';

        // HTTP fallback for XP clients that can't do TLS 1.2+.
        // With path-based routing (Nginx → backend on 127.0.0.1), the plain-HTTP
        // fallback goes through port 80 which Nginx may redirect to HTTPS.
        // Keep as best-effort; the primary URL (serverBase) is the reliable path.
        const httpFallback = `http://${serverHostname}${serverPathPrefix}`;

        return {
            sessionId: sessionId || '',
            server: serverBase,
            httpFallback,
            port: 5500,
            technicianId: technicianId || null,
            createdAt: new Date().toISOString()
        };
    }

    // Writes every script/bundle for a package into packageDir given a config
    // object (shared by per-session packages and the session-less universal
    // package — the only difference is whether config.sessionId is set).
    writePackageFiles(packageDir, config) {
        if (!fs.existsSync(packageDir)) {
            fs.mkdirSync(packageDir, { recursive: true });
        }

        fs.writeFileSync(
            path.join(packageDir, 'config.json'),
            this.toCrlf(JSON.stringify(config, null, 2))
        );

        // Windows scripts
        fs.writeFileSync(path.join(packageDir, 'launch.bat'), this.toCrlf(this.createWindowsLauncher(config)));
        fs.writeFileSync(path.join(packageDir, 'connect.bat'), this.toCrlf(this.createWindowsConnect(config)));
        fs.writeFileSync(path.join(packageDir, 'register-session.ps1'), this.toCrlf(this.createWindowsRegistration(config)));
        fs.writeFileSync(path.join(packageDir, 'register-session.vbs'), this.toCrlf(this.createWindowsRegistrationVbs(config)));
        fs.writeFileSync(path.join(packageDir, 'netcheck.vbs'), this.toCrlf(this.createWindowsNetworkCheckVbs(config)));

        // Optional bundles (portable apps) for best compatibility, especially XP.
        // Drop files into:
        //   packages/bundles/windows/tightvnc/    -> copied to <package>/tightvnc/
        //   packages/bundles/windows/tightvnc64/  -> copied to <package>/tightvnc64/
        //   packages/bundles/windows/mypal/       -> copied to <package>/mypal/
        // If absent, the ZIP will still generate (but the user must provide VNC server).
        this.copyOptionalBundle(path.join(this.packagesDir, 'bundles', 'windows', 'tightvnc'), path.join(packageDir, 'tightvnc'));
        this.copyOptionalBundle(path.join(this.packagesDir, 'bundles', 'windows', 'tightvnc64'), path.join(packageDir, 'tightvnc64'));
        this.copyOptionalBundle(path.join(this.packagesDir, 'bundles', 'windows', 'mypal'), path.join(packageDir, 'mypal'));

        // macOS/Linux scripts
        fs.writeFileSync(path.join(packageDir, 'launch.sh'), this.createUnixLauncher(config));
        fs.chmodSync(path.join(packageDir, 'launch.sh'), 0o755);

        fs.writeFileSync(path.join(packageDir, 'connect.sh'), this.createUnixConnect(config));
        fs.chmodSync(path.join(packageDir, 'connect.sh'), 0o755);

        fs.writeFileSync(path.join(packageDir, 'register-session.sh'), this.createUnixRegistration(config));
        fs.chmodSync(path.join(packageDir, 'register-session.sh'), 0o755);

        // Universal launcher (detects OS)
        fs.writeFileSync(path.join(packageDir, 'start-support'), this.createUniversalLauncher(config));
        fs.chmodSync(path.join(packageDir, 'start-support'), 0o755);

        // README
        fs.writeFileSync(path.join(packageDir, 'README.txt'), this.toCrlf(this.createReadme(config)));
    }

    async buildPackage(sessionId, technicianId) {
        const packageDir = path.join(this.packagesDir, sessionId);
        const config = this.buildServerConfig(sessionId, technicianId);
        this.writePackageFiles(packageDir, config);

        // Create ZIP package
        const zipPath = await this.createZipPackage(packageDir, sessionId, {});

        return {
            packageId: sessionId,
            file: zipPath,
            config
        };
    }

    // Session-independent Windows package (covers XP and any other legacy
    // Windows that can't run the Electron helper). No session ID baked in —
    // register-session.ps1/vbs self-register the device, display its short
    // code, and poll for a technician to assign a session, mirroring the
    // Electron helper's "install once, connect by code" flow. Built once and
    // cached to disk since it bundles the (large) TightVNC/MyPal binaries;
    // call with forceRebuild to regenerate after script-template changes.
    async buildUniversalWindowsPackage({ forceRebuild = false } = {}) {
        const zipPath = path.join(this.packagesDir, 'support-template-xp.zip');
        if (!forceRebuild && fs.existsSync(zipPath)) {
            return zipPath;
        }

        const packageDir = path.join(this.packagesDir, '_template-xp');
        const config = this.buildServerConfig('', null);
        this.writePackageFiles(packageDir, config);

        await new Promise((resolve, reject) => {
            if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
            const output = fs.createWriteStream(zipPath);
            const archive = archiver('zip', { zlib: { level: 9 } });
            output.on('close', resolve);
            archive.on('error', reject);
            archive.pipe(output);

            const includes = this.getZipIncludes('windows-xp');
            for (const entry of includes) {
                const fullPath = path.join(packageDir, entry);
                if (!fs.existsSync(fullPath)) continue;
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    archive.directory(fullPath, entry);
                } else {
                    archive.file(fullPath, { name: entry });
                }
            }
            archive.finalize();
        });

        return zipPath;
    }

    toCrlf(s) {
        // XP Notepad (and some Windows tooling) requires CRLF to display newlines correctly.
        return String(s || '').replace(/\r?\n/g, '\r\n');
    }

    copyOptionalBundle(srcDir, destDir) {
        try {
            if (!fs.existsSync(srcDir)) return false;
            fs.mkdirSync(destDir, { recursive: true });
            // Node 16+ supports cpSync; repo runs on modern Node.
            fs.cpSync(srcDir, destDir, { recursive: true, force: true });
            return true;
        } catch (_) {
            return false;
        }
    }
    
    // Windows launcher (compatible with Windows XP and later)
    createWindowsLauncher(config) {
        const serverHost = new URL(config.server).hostname;
        const sessionBanner = config.sessionId ? config.sessionId : '(will be assigned - see your support code below)';
        return `@echo off
REM Support Helper Launcher for Windows
REM Compatible with Windows XP, Vista, 7, 8, 10, 11
REM Launcher version: 2.3 (XP-safe, crash-protected, verbose logging, universal-package aware)

REM --- Crash protection: call :main so parse errors inside cannot kill the window ---
call :main
goto :end

:main
cd /d "%~dp0"

echo ========================================
echo   Remote Support Helper
echo   Session: ${sessionBanner}
echo ========================================
echo.

REM --- STEP 0: Environment info ---
echo [INFO] ---- Environment ----
echo [INFO] Date/Time: %DATE% %TIME%
echo [INFO] Working dir: %CD%
echo [INFO] OS: %OS%
echo [INFO] ComSpec: %ComSpec%
echo [INFO] Architecture: %PROCESSOR_ARCHITECTURE%
ver
echo.

echo [INFO] ---- Package contents ----
dir /b
echo.
echo [INFO] ---- TightVNC dirs ----
if exist "tightvnc" dir /b tightvnc
if exist "tightvnc64" dir /b tightvnc64
echo ---- end listing ----
echo.

REM --- STEP 1: Locate TightVNC ---
echo [STEP 1] Locating TightVNC...
set VNC_DIR=tightvnc
if /I "%PROCESSOR_ARCHITECTURE%"=="AMD64" if exist "tightvnc64\\tvnserver.exe" set VNC_DIR=tightvnc64
if defined PROCESSOR_ARCHITEW6432 if exist "tightvnc64\\tvnserver.exe" set VNC_DIR=tightvnc64

if not exist "%VNC_DIR%\\tvnserver.exe" goto no_vnc
echo [OK] TightVNC found: %VNC_DIR%\\tvnserver.exe
echo.

REM --- STEP 2: Start TightVNC Server ---
echo [STEP 2] Starting TightVNC Server...
start "" "%VNC_DIR%\\tvnserver.exe"
if errorlevel 1 goto start_failed
echo [OK] TightVNC server start command issued.
goto start_ok
:start_failed
echo [ERROR] Failed to start TightVNC server. Exit code: %ERRORLEVEL%
:start_ok
REM XP does not have "timeout" by default; use ping as a delay.
echo [INFO] Waiting 3 seconds for TightVNC to initialize...
ping -n 4 127.0.0.1 >nul
echo [OK] Wait complete.
echo.
goto register

:no_vnc
echo [ERROR] TightVNC not found in package.
echo [ERROR] Expected: %VNC_DIR%\\tvnserver.exe
echo.
echo Please ensure TightVNC Portable is included in the package.
echo.
if not exist "mypal\\mypal.exe" goto no_mypal
echo Tip: If this link was opened in Internet Explorer on Windows XP,
echo you can run "mypal\\mypal.exe" from this folder for better compatibility.
echo.
:no_mypal
echo For manual setup:
echo 1. Install TightVNC Server
echo 2. Run: tvnserver.exe -controlapp -connect ${serverHost}:5500
goto :eof

REM --- STEP 3: Register session ---
:register
echo [STEP 3] Registering session with server...
echo [INFO] Checking for PowerShell...
if exist "%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" goto do_powershell
goto check_vbs
:do_powershell
echo [INFO] PowerShell found, using PowerShell registration...
"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -ExecutionPolicy Bypass -File register-session.ps1
if errorlevel 1 goto ps_failed
echo [OK] PowerShell registration completed.
goto reg_done
:ps_failed
echo [ERROR] PowerShell registration failed. Exit code: %ERRORLEVEL%
goto reg_done

:check_vbs
echo [INFO] PowerShell not found, checking for VBScript...
if not exist "register-session.vbs" goto reg_skip
echo [INFO] Running: cscript //nologo register-session.vbs
echo ---- VBScript output ----
cscript //nologo register-session.vbs
set VBS_EXIT=%ERRORLEVEL%
echo ---- end VBScript output ----
echo [INFO] VBScript exit code: %VBS_EXIT%
if errorlevel 1 goto vbs_failed
echo [OK] VBScript registration completed.
goto reg_done
:vbs_failed
echo [ERROR] VBScript registration failed. Exit code: %VBS_EXIT%
goto reg_done

:reg_skip
echo [WARNING] No PowerShell or VBScript available, registration skipped.
echo [INFO] The session may still work, but dashboard status will not update.

:reg_done
echo.

REM --- STEP 3.5: Read the resolved session ID ---
REM Universal packages have no session baked in at build time; the
REM registration script (PS1/VBS) waits for a technician to assign one via
REM the device's support code, then writes it here. Per-session packages
REM (built with a known session ID) write the same file for consistency, so
REM this always reflects the ID actually in use.
set RESOLVED_SESSION=${config.sessionId}
if exist "session_id.txt" (
    set /p RESOLVED_SESSION=<session_id.txt
)

REM --- STEP 4: Connect to server ---
echo [STEP 4] Connecting to support server...
set CALLED_FROM_LAUNCHER=1
call connect.bat
set CONNECT_EXIT=%ERRORLEVEL%
if errorlevel 1 goto connect_failed
echo [OK] Connect script completed.
goto connect_ok
:connect_failed
echo [ERROR] Connect script failed. Exit code: %CONNECT_EXIT%
:connect_ok
echo.

echo ========================================
echo   Support session is ready!
echo   Session ID: %RESOLVED_SESSION%
echo   Waiting for technician to connect...
echo ========================================
echo.

REM --- STEP 5: Open chat window ---
echo [STEP 5] Opening chat window...
set CHAT_URL=${config.server}/customer/xp-chat.html?session=%RESOLVED_SESSION%
ver | find "5.1." >nul
if not errorlevel 1 set CHAT_URL=${config.httpFallback}/customer/xp-chat.html?session=%RESOLVED_SESSION%
echo [INFO] Chat URL: %CHAT_URL%
start "" "%CHAT_URL%"
echo [OK] Chat window opened in browser.
echo [INFO] You can use the chat window to message your technician
echo        and send/receive files.
echo.

echo [INFO] Session initialization complete at %TIME%
echo [INFO] Keep this window open until your technician is done.
goto :eof

:end
echo.
echo ========================================
echo   Press any key to close this window...
echo ========================================
pause >nul
`;
    }
    
    // Windows connect script
    createWindowsConnect(config) {
        const serverHost = new URL(config.server).hostname;
        const serverPort = config.port || 5500;
        return `@echo off
REM Connect TightVNC to server (reverse connection)
REM Version: 2.2

cd /d "%~dp0"

echo [INFO] Connect script started at %TIME%

set VNC_DIR=tightvnc
if /I "%PROCESSOR_ARCHITECTURE%"=="AMD64" if exist "tightvnc64\\tvnserver.exe" set VNC_DIR=tightvnc64
if defined PROCESSOR_ARCHITEW6432 if exist "tightvnc64\\tvnserver.exe" set VNC_DIR=tightvnc64

if not exist "%VNC_DIR%\\tvnserver.exe" goto no_vnc
echo [OK] TightVNC found: %VNC_DIR%\\tvnserver.exe

REM Network check (HTTP to server) for clearer error messages
if not exist "netcheck.vbs" goto skip_netcheck
echo [INFO] Running network connectivity check to server...
cscript //nologo netcheck.vbs
set NETCHECK_EXIT=%ERRORLEVEL%
if errorlevel 1 goto netcheck_failed
echo [OK] Network check passed - server is reachable.
goto skip_netcheck
:netcheck_failed
echo [WARNING] Network check failed - exit code: %NETCHECK_EXIT%
echo [WARNING] Cannot reach the server over HTTP.
echo [WARNING] This may indicate no internet connection or a firewall/proxy issue.
echo [INFO] Will attempt VNC connection anyway...
echo.

:skip_netcheck
echo [INFO] Connecting VNC to ${serverHost}:${serverPort}...
"%VNC_DIR%\\tvnserver.exe" -controlapp -connect ${serverHost}:${serverPort}
set VNC_EXIT=%ERRORLEVEL%
if errorlevel 1 goto vnc_failed
echo [OK] VNC reverse connection command sent.
echo [INFO] Connect finished at %TIME%
goto done
:vnc_failed
echo [ERROR] VNC connection failed - exit code: %VNC_EXIT%
echo [ERROR] Please check your internet connection.
echo [ERROR] If internet works, a firewall may be blocking port ${serverPort}.
goto done

:no_vnc
echo [ERROR] TightVNC not found in: %VNC_DIR%\\tvnserver.exe
echo [ERROR] Cannot establish connection.

:done
REM If run directly (not from launch.bat), pause so the window stays open.
if not defined CALLED_FROM_LAUNCHER pause
`;
    }

    // Windows network check (VBScript, XP compatible)
    createWindowsNetworkCheckVbs(config) {
        // Use full server URL (including path prefix like /remote) for health check
        const serverBase = config.server.replace(/\/$/, '');
        const fallbackBase = config.httpFallback ? config.httpFallback.replace(/\/$/, '') : '';
        return `On Error Resume Next

Function TryUrl(url)
    TryUrl = False
    If Len(url) = 0 Then Exit Function
    Err.Clear
    Dim h
    Set h = CreateObject("MSXML2.ServerXMLHTTP")
    If Err.Number <> 0 Then
        Err.Clear
        Set h = CreateObject("MSXML2.XMLHTTP")
        If Err.Number <> 0 Then
            Err.Clear
            Exit Function
        End If
    Else
        h.setTimeouts 3000, 3000, 3000, 3000
        Err.Clear
    End If
    h.open "GET", url, False
    h.send
    If Err.Number = 0 Then
        If h.status >= 200 And h.status < 400 Then TryUrl = True
    End If
    Err.Clear
End Function

If TryUrl("${serverBase}/api/health") Then
    WScript.Quit 0
ElseIf TryUrl("${fallbackBase}/api/health") Then
    WScript.Quit 0
Else
    WScript.Quit 1
End If
`;
    }
    
    // Windows registration script (PowerShell, compatible with XP SP3+)
    createWindowsRegistration(config) {
        // Use full server URL (including path prefix like /remote) so API calls work with path-based routing
        const serverBase = config.server.replace(/\/$/, '');
        return `param(
    [string]$SessionId = "${config.sessionId}",
    [string]$ServerBase = "${serverBase}"
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

function Format-Code([string]$code) {
    $out = ""
    for ($i = 0; $i -lt $code.Length; $i++) {
        $out += $code[$i]
        if ((($i + 1) % 3) -eq 0 -and ($i + 1) -ne $code.Length) { $out += " " }
    }
    return $out
}

# Register this device (upsert; safe to call every run). Creates the device
# row on first run and returns a short, human-readable code (like AnyDesk's
# ID) the user can read to a technician. Also required for the
# /api/devices/pending polling below to find this device at all.
$shortCode = $null
try {
    $regBody = "{""deviceId"":""$(Escape-Json $deviceId)"",""os"":""$(Escape-Json $clientInfo.os)"",""hostname"":""$(Escape-Json $clientInfo.hostname)"",""arch"":""$(Escape-Json $clientInfo.arch)"",""allowUnattended"":true,""version"":""xp-legacy""}"
    $regResp = Http-PostJson "$ServerBase/api/devices/register" $regBody
    if ($regResp -match '\"short_code\"\\s*:\\s*\"([^\"]+)\"') {
        $shortCode = $matches[1]
    }
} catch {
    Write-Host "Device registration failed: $_" -ForegroundColor Yellow
}

if ($SessionId -and $SessionId.Length -gt 0) {
    # Per-session package (technician already created this session at build
    # time). Check once for a pending override, else use the baked-in ID.
    try {
        $pendingJson = Http-Get "$ServerBase/api/devices/pending/$deviceId"
        if ($pendingJson -match '\"pending\"\\s*:\\s*true' -and $pendingJson -match '\"sessionId\"\\s*:\\s*\"([^\"]+)\"') {
            $SessionId = $matches[1]
        }
    } catch {
        # Ignore pending lookup errors
    }
} else {
    # Universal package: no session baked in. Show the code and wait for a
    # technician to assign a session to this device, polling until it appears.
    if (-not $shortCode) {
        Write-Host "No device code available and no session assigned. Cannot continue." -ForegroundColor Red
        exit 1
    }
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ("  YOUR SUPPORT CODE: " + (Format-Code $shortCode)) -ForegroundColor Cyan
    Write-Host "  Give this code to your technician." -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""

    $maxWaitSeconds = 900
    $waited = 0
    $found = $false
    while ($waited -lt $maxWaitSeconds) {
        try {
            $pendingJson = Http-Get "$ServerBase/api/devices/pending/$deviceId"
            if ($pendingJson -match '\"pending\"\\s*:\\s*true' -and $pendingJson -match '\"sessionId\"\\s*:\\s*\"([^\"]+)\"') {
                $SessionId = $matches[1]
                $found = $true
                break
            }
        } catch {
            # Ignore poll errors, keep retrying until timeout
        }
        Write-Host ("Waiting for technician... (your code: " + (Format-Code $shortCode) + ")")
        Start-Sleep -Seconds 5
        $waited += 5
    }

    if (-not $found) {
        Write-Host "Timed out waiting for a technician to connect." -ForegroundColor Red
        Write-Host ("Your code was: " + (Format-Code $shortCode)) -ForegroundColor Red
        Write-Host "Run launch.bat again to keep waiting." -ForegroundColor Red
        exit 1
    }
}

# Let launch.bat know which session ended up being used (needed for the chat
# window URL, since universal packages have no session baked in at build time).
try { $SessionId | Out-File -FilePath "session_id.txt" -Encoding ascii -NoNewline } catch {}

$body = "{""sessionId"":""$(Escape-Json $SessionId)"",""clientInfo"":{""os"":""$(Escape-Json $clientInfo.os)"",""arch"":""$(Escape-Json $clientInfo.arch)"",""hostname"":""$(Escape-Json $clientInfo.hostname)"",""username"":""$(Escape-Json $clientInfo.username)""},""vncPort"":5900,""status"":""connected"",""deviceId"":""$(Escape-Json $deviceId)"",""deviceName"":""$(Escape-Json $env:COMPUTERNAME)""}"

try {
    $uri = "$ServerBase/api/sessions/register"
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
        // Use full server URL (including path prefix like /remote) so API calls work with path-based routing
        const serverBase = config.server.replace(/\/$/, '');
        const fallbackBase = config.httpFallback ? config.httpFallback.replace(/\/$/, '') : '';
        return `' Remote Support Helper registration (VBScript; works on Windows XP)
Option Explicit

Dim SessionId, ServerBase, FallbackBase
SessionId = "${config.sessionId}"
ServerBase = "${serverBase}"
FallbackBase = "${fallbackBase}"

' Universal (no session baked in at build time) packages wait here for a
' technician to assign a session via the device's short code. Per-session
' packages (SessionId already set) skip straight to using it, same as before.
Const POLL_INTERVAL_MS = 5000
Const MAX_WAIT_SECONDS = 900 ' 15 minutes

WScript.Echo "[VBS] Starting registration script..."
WScript.Echo "[VBS] SessionId: " & SessionId
WScript.Echo "[VBS] ServerBase: " & ServerBase

Dim appData, deviceDir, deviceFile, deviceId
On Error Resume Next
appData = CreateObject("WScript.Shell").ExpandEnvironmentStrings("%APPDATA%")
If Err.Number <> 0 Then
  WScript.Echo "[VBS] ERROR: Failed to get APPDATA: " & Err.Description
  Err.Clear
End If
If Len(appData) = 0 Then 
  appData = CreateObject("WScript.Shell").ExpandEnvironmentStrings("%USERPROFILE%") & "\\Application Data"
  WScript.Echo "[VBS] APPDATA empty, using USERPROFILE: " & appData
Else
  WScript.Echo "[VBS] APPDATA: " & appData
End If
deviceDir = appData & "\\RemoteSupport"
deviceFile = deviceDir & "\\device_id.txt"
WScript.Echo "[VBS] Device directory: " & deviceDir

Dim fso: Set fso = CreateObject("Scripting.FileSystemObject")
If Err.Number <> 0 Then
  WScript.Echo "[VBS] ERROR: Failed to create FileSystemObject: " & Err.Description
  WScript.Quit 1
End If
If Not fso.FolderExists(deviceDir) Then 
  fso.CreateFolder(deviceDir)
  WScript.Echo "[VBS] Created device directory: " & deviceDir
Else
  WScript.Echo "[VBS] Device directory exists: " & deviceDir
End If

If fso.FileExists(deviceFile) Then
  deviceId = Trim(ReadAllText(deviceFile))
  WScript.Echo "[VBS] Loaded existing device ID: " & deviceId
Else
  On Error Resume Next
  deviceId = Replace(Replace(CreateObject("Scriptlet.TypeLib").Guid, "{", ""), "}", "")
  If Err.Number <> 0 Then
    WScript.Echo "[VBS] ERROR: Failed to generate GUID: " & Err.Description
    deviceId = "unknown-device-" & Year(Now) & Month(Now) & Day(Now) & Hour(Now) & Minute(Now) & Second(Now)
    WScript.Echo "[VBS] Using fallback device ID: " & deviceId
  Else
    WScript.Echo "[VBS] Generated new device ID: " & deviceId
  End If
  WriteAllText deviceFile, deviceId
End If
On Error GoTo 0

' Determine base URL (try primary, fall back to HTTP for XP/TLS compat)
Dim baseUrl: baseUrl = ServerBase
WScript.Echo "[VBS] Trying primary URL: " & baseUrl & " ..."
On Error Resume Next
Dim testResult: testResult = HttpGet(baseUrl & "/api/health")
If Err.Number <> 0 Or Len(testResult) = 0 Then
  Err.Clear
  If Len(FallbackBase) > 0 Then
    WScript.Echo "[VBS] Primary URL failed, trying HTTP fallback: " & FallbackBase
    baseUrl = FallbackBase
    testResult = HttpGet(baseUrl & "/api/health")
    If Err.Number <> 0 Or Len(testResult) = 0 Then
      WScript.Echo "[VBS] WARNING: HTTP fallback also failed. Registration may not work."
      Err.Clear
    Else
      WScript.Echo "[VBS] HTTP fallback OK."
    End If
  Else
    WScript.Echo "[VBS] WARNING: Primary URL failed and no fallback configured."
    Err.Clear
  End If
Else
  WScript.Echo "[VBS] Primary URL OK."
End If
On Error GoTo 0

Dim osName, osVer, arch, host, user
osName = "Windows"
osVer = ""
On Error Resume Next
arch = CreateObject("WScript.Shell").ExpandEnvironmentStrings("%PROCESSOR_ARCHITECTURE%")
host = CreateObject("WScript.Shell").ExpandEnvironmentStrings("%COMPUTERNAME%")
user = CreateObject("WScript.Shell").ExpandEnvironmentStrings("%USERNAME%")
WScript.Echo "[VBS] System info - OS: " & osName & ", Arch: " & arch & ", Host: " & host & ", User: " & user
If Err.Number <> 0 Then
  WScript.Echo "[VBS] ERROR: Failed to get system info: " & Err.Description
  Err.Clear
End If
On Error GoTo 0

' Register this device with the server. This is always safe to call (it's an
' upsert): it creates the device row on first run and returns a short,
' human-readable code (like AnyDesk's ID) the user can read to a technician.
' It also makes this device eligible for /api/devices/pending polling below.
WScript.Echo "[VBS] Registering device..."
Dim regPayload, regResp, shortCode
regPayload = "{""deviceId"":""" & EscapeJson(deviceId) & """,""os"":""" & EscapeJson(osName) & """,""hostname"":""" & EscapeJson(host) & """,""arch"":""" & EscapeJson(arch) & """,""allowUnattended"":true,""version"":""xp-legacy""}"
regResp = HttpPostRaw(baseUrl & "/api/devices/register", regPayload)
shortCode = JsonGetString(regResp, "short_code")
If Len(shortCode) > 0 Then
  WScript.Echo "[VBS] Device short code: " & FormatCode(shortCode)
Else
  WScript.Echo "[VBS] WARNING: Device registration did not return a short code."
End If

If Len(SessionId) > 0 Then
  ' Per-session package (technician already created this session at build
  ' time). Check once for a pending override, else use the baked-in ID.
  WScript.Echo "[VBS] Checking for pending session (base: " & baseUrl & ")..."
  On Error Resume Next
  Dim pendingJson: pendingJson = HttpGet(baseUrl & "/api/devices/pending/" & deviceId)
  If InStr(1, pendingJson, """pending"":true", vbTextCompare) > 0 Then
    Dim psid: psid = JsonGetString(pendingJson, "sessionId")
    If Len(psid) > 0 Then
      SessionId = psid
      WScript.Echo "[VBS] Found pending session ID: " & SessionId
    End If
  End If
  On Error GoTo 0
Else
  ' Universal package: no session baked in. Show the code and wait for a
  ' technician to assign a session to this device (dashboard "Connect by
  ' code"), polling until it appears.
  If Len(shortCode) = 0 Then
    WScript.Echo "[ERROR] No device code available and no session assigned. Cannot continue."
    WScript.Quit 1
  End If
  WScript.Echo ""
  WScript.Echo "========================================"
  WScript.Echo "  YOUR SUPPORT CODE: " & FormatCode(shortCode)
  WScript.Echo "  Give this code to your technician."
  WScript.Echo "========================================"
  WScript.Echo ""

  Dim waited, found
  waited = 0
  found = False
  Do While waited < MAX_WAIT_SECONDS
    On Error Resume Next
    Dim pj: pj = HttpGet(baseUrl & "/api/devices/pending/" & deviceId)
    If InStr(1, pj, """pending"":true", vbTextCompare) > 0 Then
      Dim sid: sid = JsonGetString(pj, "sessionId")
      If Len(sid) > 0 Then
        SessionId = sid
        found = True
      End If
    End If
    On Error GoTo 0
    If found Then Exit Do
    WScript.Echo "[INFO] Waiting for technician... (your code: " & FormatCode(shortCode) & ")"
    WScript.Sleep POLL_INTERVAL_MS
    waited = waited + (POLL_INTERVAL_MS \\ 1000)
  Loop

  If Not found Then
    WScript.Echo "[ERROR] Timed out waiting for a technician to connect."
    WScript.Echo "[ERROR] Your code was: " & FormatCode(shortCode)
    WScript.Echo "[ERROR] Run launch.bat again to keep waiting."
    WScript.Quit 1
  End If
End If

' Let launch.bat know which session ended up being used (needed for the chat
' window URL, since universal packages have no session baked in at build time).
On Error Resume Next
WriteAllText "session_id.txt", SessionId
On Error GoTo 0

Dim payload
payload = "{""sessionId"":""" & EscapeJson(SessionId) & """,""clientInfo"":{""os"":""" & EscapeJson(osName) & """,""arch"":""" & EscapeJson(arch) & """,""hostname"":""" & EscapeJson(host) & """,""username"":""" & EscapeJson(user) & """},""vncPort"":5900,""status"":""connected"",""deviceId"":""" & EscapeJson(deviceId) & """,""deviceName"":""" & EscapeJson(host) & """}"
WScript.Echo "[VBS] Payload length: " & Len(payload)
WScript.Echo "[VBS] Registering session..."

Dim registerUrl: registerUrl = baseUrl & "/api/sessions/register"
WScript.Echo "[VBS] Register URL: " & registerUrl
Dim postOk: postOk = HttpPostJson(registerUrl, payload)
If Not postOk Then
  WScript.Echo "[VBS] Registration failed, but session may still work."
  WScript.Quit 1
Else
  WScript.Echo "[VBS] Registration completed successfully."
End If

WScript.Echo "[VBS] Script completed, exiting..."
WScript.Quit 0

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
  If IsNull(s) Or IsEmpty(s) Then
    EscapeJson = ""
    Exit Function
  End If
  Dim t: t = CStr(s)
  t = Replace(t, "\\", "\\\\")
  t = Replace(t, """", "\\""")
  t = Replace(t, vbCr, "\\r")
  t = Replace(t, vbLf, "\\n")
  t = Replace(t, vbTab, "\\t")
  ' Strip any remaining control characters (< 0x20) that would break JSON
  Dim i, c, result: result = ""
  For i = 1 To Len(t)
    c = Mid(t, i, 1)
    If AscW(c) >= 32 Then
      result = result & c
    End If
  Next
  EscapeJson = result
End Function

Function CreateHTTP()
  ' Try ServerXMLHTTP first (supports setTimeouts), fall back to XMLHTTP
  On Error Resume Next
  Set CreateHTTP = CreateObject("MSXML2.ServerXMLHTTP")
  If Err.Number = 0 Then
    WScript.Echo "[VBS] Using MSXML2.ServerXMLHTTP"
    CreateHTTP.setTimeouts 10000, 10000, 10000, 10000
    Err.Clear
    Exit Function
  End If
  Err.Clear
  Set CreateHTTP = CreateObject("MSXML2.XMLHTTP")
  If Err.Number = 0 Then
    WScript.Echo "[VBS] Using MSXML2.XMLHTTP (fallback)"
    Exit Function
  End If
  Err.Clear
  WScript.Echo "[VBS] ERROR: No MSXML HTTP object available"
  Set CreateHTTP = Nothing
End Function

Function HttpGet(url)
  On Error Resume Next
  Dim x: Set x = CreateHTTP()
  If x Is Nothing Then
    HttpGet = ""
    Exit Function
  End If
  Err.Clear
  x.Open "GET", url, False
  x.Send
  If Err.Number <> 0 Then
    WScript.Echo "[VBS] ERROR: HTTP GET failed: " & Err.Description & " (Error " & Err.Number & ")"
    HttpGet = ""
  Else
    WScript.Echo "[VBS] HTTP GET status: " & x.status & " " & x.statusText
    HttpGet = x.responseText
  End If
  On Error GoTo 0
End Function

Function HttpPostJson(url, json)
  HttpPostJson = False
  On Error Resume Next
  Dim x: Set x = CreateHTTP()
  If x Is Nothing Then
    Exit Function
  End If
  Err.Clear
  x.Open "POST", url, False
  x.setRequestHeader "Content-Type", "application/json"
  x.Send json
  If Err.Number <> 0 Then
    WScript.Echo "[VBS] ERROR: HTTP POST failed: " & Err.Description & " (Error " & Err.Number & ")"
  Else
    WScript.Echo "[VBS] HTTP POST status: " & x.status & " " & x.statusText
    If x.status >= 200 And x.status < 300 Then
      WScript.Echo "[VBS] Registration successful!"
      HttpPostJson = True
    Else
      WScript.Echo "[VBS] Registration returned status: " & x.status
      WScript.Echo "[VBS] Response: " & Left(x.responseText, 200)
    End If
  End If
  On Error GoTo 0
End Function

Function HttpPostRaw(url, json)
  ' Like HttpPostJson but returns the raw response body (for reading fields
  ' like short_code out of the JSON) instead of a boolean.
  On Error Resume Next
  HttpPostRaw = ""
  Dim x: Set x = CreateHTTP()
  If x Is Nothing Then
    Exit Function
  End If
  Err.Clear
  x.Open "POST", url, False
  x.setRequestHeader "Content-Type", "application/json"
  x.Send json
  If Err.Number <> 0 Then
    WScript.Echo "[VBS] ERROR: HTTP POST failed: " & Err.Description & " (Error " & Err.Number & ")"
  Else
    HttpPostRaw = x.responseText
  End If
  On Error GoTo 0
End Function

Function FormatCode(raw)
  ' "123456789" -> "123 456 789"
  Dim i, out
  out = ""
  For i = 1 To Len(raw)
    out = out & Mid(raw, i, 1)
    If (i Mod 3 = 0) And (i <> Len(raw)) Then out = out & " "
  Next
  FormatCode = out
End Function

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
SERVER_BASE="${config.server.replace(/\/$/, '')}"
SERVER_HOST="${new URL(config.server).hostname}"
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
        // Use full server URL (including path prefix like /remote) so API calls work with path-based routing
        const serverBase = config.server.replace(/\/$/, '');
        return `#!/bin/bash
# Register session with server

cd "$(dirname "$0")"

SESSION_ID="${config.sessionId}"
SERVER_BASE="${serverBase}"

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
PENDING_JSON=$(curl -s "$SERVER_BASE/api/devices/pending/$DEVICE_ID")
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
        "$SERVER_BASE/api/sessions/register" \\
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
        echo "  Attempted to connect to: $SERVER_BASE"
        if echo "$SERVER_BASE" | grep -q "localhost\|127.0.0.1"; then
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
        "$SERVER_BASE/api/sessions/register" -O /tmp/register_response.json 2>&1
    if [ $? -eq 0 ]; then
        echo "✓ Session registration attempted"
        if [ -f /tmp/register_response.json ]; then
            cat /tmp/register_response.json
            rm -f /tmp/register_response.json
        fi
    else
        echo "⚠ Registration failed"
        echo "  Server: $SERVER_BASE"
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
        const isUniversal = !config.sessionId;
        const sessionLine = isUniversal
            ? 'Session ID: (assigned automatically on first run - see below)'
            : `Session ID: ${config.sessionId}`;
        const supportLinkLine = isUniversal
            ? ''
            : `Support Link: ${String(config.server).replace(/\/$/, '')}/support/${config.sessionId}\n`;
        return `Remote Support Helper
====================

${sessionLine}
${supportLinkLine}
WINDOWS XP QUICK START (recommended for XP):
  1. Extract this ZIP to your Desktop (or any folder).
  2. Double-click "launch.bat" (shown as "launch" if file extensions are hidden).
  3. If Windows Firewall asks, click "Unblock" / "Allow".
  4. The window will show a support code (9 digits) - read it to your technician.
  5. Keep the black window open until your technician finishes.
  6. If the technician asks you to reconnect, double-click "connect.bat".

  Notes for XP:
  - Ignore the *.sh files (they are for macOS/Linux).
  - If your browser cannot open automatically, run: mypal\\mypal.exe (if included)
    ${isUniversal ? 'and it will open once a technician has connected.' : 'and paste the Support Link above into MyPal.'}

PLATFORM NOTES:

Windows (XP, Vista, 7, 8, 10, 11):
  - Start: double-click "launch.bat"
  - Reconnect only: double-click "connect.bat"
  - Keep the window open while receiving support

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
- ${sessionLine}

For support, contact your technician.
`;
    }
    
    normalizeZipOs(os) {
        if (!os) return null;
        const raw = String(os).toLowerCase().replace(/[^a-z0-9-]/g, '');
        if (raw === 'windowsxp' || raw === 'xp' || raw === 'windows-xp') return 'windows-xp';
        if (raw === 'windows' || raw === 'win') return 'windows';
        if (raw === 'linux') return 'linux';
        if (raw === 'mac' || raw === 'macos' || raw === 'osx') return 'mac';
        if (raw === 'other') return 'other';
        return null;
    }

    getZipPath(sessionId, os) {
        const suffix = os ? `-${os}` : '';
        return path.join(this.packagesDir, `support-${sessionId}${suffix}.zip`);
    }

    getZipIncludes(os) {
        const base = ['config.json', 'README.txt'];
        if (os === 'windows' || os === 'windows-xp') {
            return base.concat([
                'launch.bat',
                'connect.bat',
                'register-session.ps1',
                'register-session.vbs',
                'netcheck.vbs',
                'tightvnc',
                'tightvnc64',
                'mypal'
            ]);
        }
        if (os === 'linux') {
            return base.concat(['launch.sh', 'connect.sh', 'register-session.sh', 'start-support']);
        }
        if (os === 'mac') {
            return base.concat(['launch.sh', 'connect.sh', 'register-session.sh', 'start-support']);
        }
        // Fallback: include everything
        return base.concat([
            'start-support',
            'launch.sh',
            'connect.sh',
            'register-session.sh',
            'launch.bat',
            'connect.bat',
            'register-session.ps1',
            'register-session.vbs',
            'netcheck.vbs',
            'tightvnc',
            'tightvnc64',
            'mypal'
        ]);
    }

    async createZipPackage(packageDir, sessionId, { os } = {}) {
        const normalizedOs = this.normalizeZipOs(os);
        const zipPath = this.getZipPath(sessionId, normalizedOs);
        
        return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(zipPath);
            const archive = archiver('zip', { zlib: { level: 9 } });
            
            output.on('close', () => {
                resolve(zipPath);
            });
            
            archive.on('error', reject);
            archive.pipe(output);

            const includes = this.getZipIncludes(normalizedOs);
            for (const entry of includes) {
                const fullPath = path.join(packageDir, entry);
                if (!fs.existsSync(fullPath)) continue;
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    archive.directory(fullPath, entry);
                } else {
                    archive.file(fullPath, { name: entry });
                }
            }
            archive.finalize();
        });
    }
    
    async getPackagePath(sessionId, type = 'zip', os = null) {
        const normalized = type.toLowerCase();
        if (normalized === 'zip') {
            const normalizedOs = this.normalizeZipOs(os);
            const zipPath = this.getZipPath(sessionId, normalizedOs);
            if (fs.existsSync(zipPath)) return zipPath;
            return null;
        }

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

    getDownloadName(sessionId, type = 'zip', os = null) {
        const extension = this.getExtension(type);
        if (type === 'zip') {
            const normalizedOs = this.normalizeZipOs(os);
            const suffix = normalizedOs ? `-${normalizedOs}` : '';
            return `support-helper-${sessionId}${suffix}.zip`;
        }
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
            if (variant.type === 'zip') {
                // ZIP is generated on-demand, so it should always be selectable.
                packages.push({
                    type: variant.type,
                    label: variant.label,
                    available: true,
                    size: null,
                    downloadUrl: `/api/packages/download/${sessionId}?type=${variant.type}`
                });
                continue;
            }

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
        const templatePath = this.getTemplatePath(normalized);
        if (!templatePath || !fs.existsSync(templatePath)) {
            // No template to copy from — keep any existing session binary as-is.
            return fs.existsSync(targetPath);
        }

        // Refresh the session binary when the template is newer (e.g. a new helper
        // release), so old session links always serve the current installer
        // instead of being frozen at whatever version existed at session creation.
        if (fs.existsSync(targetPath)) {
            try {
                const tpl = fs.statSync(templatePath).mtimeMs;
                const cur = fs.statSync(targetPath).mtimeMs;
                if (cur >= tpl) return true;
            } catch (_) {
                return true;
            }
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
