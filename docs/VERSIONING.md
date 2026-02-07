# Versioning

The platform uses **one canonical version** in the root `package.json`. The helper (Electron app) and the web apps (frontend + backend) stay in sync with it.

## Where the version lives

| Place | Purpose |
|-------|---------|
| **Root `package.json`** | Canonical version. Bump here. |
| **`helper/package.json`** | Used by Electron/electron-builder for the EXE/DMG. |
| **`frontend/package.json`** | Kept in sync for consistency. |
| **Backend** | Serves version via `GET /api/version` (reads root). |

## Bumping the version

1. **Edit** `package.json` in the repo root and set the new `version` (e.g. `1.1.0`).
2. **Sync** helper and frontend from root:
   ```bash
   npm run version:sync
   ```
   Or set a new version and sync in one go:
   ```bash
   node scripts/sync-version.js 1.1.0
   ```
3. **Commit** the version changes (root + helper + frontend `package.json`).

## Where version is shown

- **Dashboard:** Footer shows “Remote Support Platform vX.Y.Z” (from `/api/version`).
- **Helper:** Small “Helper vX.Y.Z” in the helper window (from `helper/package.json` at build time).

## Releases and CI

- **Build Helper (Win + Mac)**  
  On push to `main` or manual run: runs `node scripts/sync-version.js` so the built helper and frontend use the version from root. Optional workflow input `version` can override (e.g. `1.2.0`).

- **Release Helper** (on tag `v*`)  
  Sets the helper version from the tag (e.g. `v1.0.0` → `1.0.0`) before building, then creates a GitHub Release with EXE and DMG. Tag with:
  ```bash
  git tag v1.0.0
  git push origin v1.0.0
  ```

## Scripts

| Script | Usage |
|--------|--------|
| `npm run version:sync` | Copy version from root to helper and frontend. |
| `node scripts/sync-version.js [version]` | Optionally set root version, then sync to helper and frontend. |
| `node scripts/set-helper-version.js [v]X.Y.Z` | Set only `helper/package.json` version (used in release workflow). |
