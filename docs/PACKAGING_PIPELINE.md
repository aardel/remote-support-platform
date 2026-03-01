# Packaging Pipeline (Phase 1)

This project supports three package variants:

- `exe` (Windows one-click helper)
- `dmg` (macOS helper app)
- `zip` (fallback / XP)

The backend will automatically expose a package if a file exists in:

```
packages/
  support-<SESSION_ID>.exe
  support-<SESSION_ID>.dmg
  support-<SESSION_ID>.zip
```

To avoid rebuilding per session, you can provide templates:

```
packages/
  support-template.exe
  support-template.dmg
```

When a session is created, the backend copies any available template to:
`support-<SESSION_ID>.<ext>`.

You can upload templates via the API:

```
POST /api/packages/templates?type=exe|dmg
Form field: file=@/path/to/installer
```

The support page calls `GET /api/packages/manifest/:sessionId` to determine
which packages are available and enables the correct download button.

## Phase 1 Strategy

1. Keep ZIP generation in the backend (already implemented).
2. Build EXE/DMG externally using a helper app build pipeline.
3. Drop the resulting EXE/DMG into `packages/` with the session ID filename.

## Recommended Build Options

### Windows EXE

Use one of:
- Electron + `electron-builder` (NSIS)
- NSIS script wrapping a portable helper

Expected output:
```
support-<SESSION_ID>.exe
```

#### CI (GitHub Actions)

This repo includes a Windows workflow:
`.github/workflows/build-win.yml`

Run it via `Actions -> Build Windows EXE -> Run workflow`.
Download the artifact and upload it as the EXE template using the dashboard
or the API:

```
POST /api/packages/templates?type=exe
Form field: file=@/path/to/RemoteSupportHelper.exe
```

### macOS DMG

Use Electron + `electron-builder` to produce a signed `.dmg`.

Expected output:
```
support-<SESSION_ID>.dmg
```

#### CI (GitHub Actions)

This repo includes a macOS workflow:
`.github/workflows/build-mac.yml`

Run it via `Actions -> Build macOS DMG -> Run workflow`.
Download the artifact and upload it as the DMG template using the dashboard
or the API:

```
POST /api/packages/templates?type=dmg
Form field: file=@/path/to/RemoteSupportHelper.dmg
```

## Helper App Responsibilities

The helper should:
1. Generate or load a persistent `deviceId`.
2. Call `GET /api/devices/pending/:deviceId` to detect a pending session.
3. Call `POST /api/sessions/register` with:
   - `sessionId` (pending or bundled)
   - `deviceId`
   - `clientInfo`
4. Start TightVNC and connect reverse to server.
5. Respect `allowUnattended` based on user toggle.

## Next Steps

- Build a minimal helper app (Electron or native).
- Add CI job to create and upload per-session EXE/DMG.
