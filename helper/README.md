# Remote Support Helper (Phase 1)

This helper app is packaged as:
- Windows EXE
- macOS DMG

It reads `config.json` bundled in the app resources:

```json
{
  "sessionId": "ABC-123-XYZ",
  "server": "https://173.249.10.40:8460",
  "port": 5500
}
```

## Behavior

1. Generates or loads a persistent `deviceId`
2. Checks `/api/devices/pending/:deviceId`
3. Uses pending session if present, otherwise uses `sessionId` from config
4. Registers the session: `/api/sessions/register`
5. Starts VNC server (stubbed in Phase 1)

## Build

```bash
npm install
npm run build:win
npm run build:mac
```

## Output

- Windows: `dist/*.exe`
- macOS: `dist/*.dmg`

Copy the output to:

```
/opt/remote-support/packages/support-<SESSION_ID>.exe
/opt/remote-support/packages/support-<SESSION_ID>.dmg
```
