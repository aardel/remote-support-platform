# Helper updates (customer prompt)

When a new helper version is available on the server, the helper app can tell the customer and let them choose **Upgrade now** or **Next session**.

## Flow

1. **On startup** (after the helper has config and session), it calls the server:  
   `GET /api/helper/update-info?platform=win|darwin&currentVersion=X.Y.Z`
2. The server compares `currentVersion` with the latest version (from `packages/support-template.version` or root `package.json`) and returns `updateAvailable`, `latestVersion`, and `downloadUrl`.
3. If an update is available, the helper shows a **banner**:  
   *"Update available: Version X.Y.Z is available. You can upgrade now or at your next session."*
4. **Upgrade now**  
   - Downloads the installer from `downloadUrl` (EXE on Windows, DMG on macOS).  
   - Opens the installer (user can complete the install).  
   - Helper quits so the new version can replace it.
5. **Next session**  
   - Banner is closed for this run.  
   - Next time the customer opens the helper, the check runs again and they can choose again.

## Server requirement

The server must have the latest helper installers and version file:

- `packages/support-template.exe` (Windows)
- `packages/support-template.dmg` (macOS)
- `packages/support-template.version` (one line, e.g. `1.0.2`)

The **Build Helper** GitHub Action can deploy these so the server always serves the latest build. See `docs/DEPLOYMENT.md` and `.github/workflows/build-helper.yml`.

## API

| Endpoint | Purpose |
|----------|---------|
| GET /api/helper/update-info?platform=win\|darwin&currentVersion=X.Y.Z | Check if an update is available; returns `updateAvailable`, `latestVersion`, `downloadUrl`. No auth. |
| GET /api/helper/download/win or /api/helper/download/darwin | Download the latest helper installer. No auth. |

See `docs/API_AND_EVENTS.md` for the full API table.

## Troubleshooting: macOS “Could not start video source”

On macOS, screen sharing requires **Screen Recording** permission. If the helper shows “Screen capture error: Could not start video source” or “Connection failed” right after “Capturing screen...”, the customer must:

1. Open **System Settings** → **Privacy & Security** → **Screen Recording**.
2. Enable the checkbox for the helper app (e.g. “Remote Support” or the app name from the DMG).
3. Restart the helper and click **Start Support** again.

The helper shows an on-screen hint on Mac and, when this error occurs, a status message directing the user to grant Screen Recording. For remote control (mouse/keyboard), **Accessibility** permission is also required on macOS.
