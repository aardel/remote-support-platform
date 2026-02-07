# GitHub Actions: Helper builds and deploy

## Workflows

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| **Build Helper (Win + Mac)** | Push to `main`, or "Run workflow" | Builds Windows EXE and macOS DMG in one run. Artifacts: `helper-exe`, `helper-dmg`. **Deploys to server automatically** when secrets are set (uploads latest EXE/DMG as templates). |
| **Release Helper** | Push tag `v*` (e.g. `v1.0.0`) | Builds both, then creates a GitHub Release with the EXE and DMG attached. |
| Build Windows EXE | Manual only | Builds only Windows (kept for one-off runs). |
| Build macOS DMG | Manual only | Builds only macOS (kept for one-off runs). |

## Version in builds

- **Build Helper (Win + Mac):** Before building, the workflow runs `node scripts/sync-version.js` so the helper and frontend use the version from root `package.json`. Optional workflow input `version` can override.
- **Release Helper** (on tag `v*`): Before building, the workflow sets the helper version from the tag (e.g. `v1.0.0` → `1.0.0`) so the EXE/DMG are labeled correctly. See `docs/VERSIONING.md`.

## One run = both platforms

- Push to `main` or run **Build Helper (Win + Mac)** once → both artifacts are produced. No need to run two workflows.
- Download both from the same run: **Actions** → select the run → **Artifacts** → `helper-exe`, `helper-dmg`.

## Release from a tag

```bash
git tag v1.0.0
git push origin v1.0.0
```

The **Release Helper** workflow runs, builds Win + Mac, and creates a release at `https://github.com/<owner>/<repo>/releases/tag/v1.0.0` with the EXE and DMG attached. You can download them from the release page.

## Deploy templates to server (automatic)

When these secrets are set, **every** successful build (push to `main` or manual run) uploads the latest EXE and DMG to your server. No manual download or dashboard upload.

1. **Repo** → **Settings** → **Secrets and variables** → **Actions**.
2. Add:
   - **DEPLOY_SSH_KEY**: Private SSH key (full content, including `-----BEGIN ... -----`) that can log in to the server.
   - **SERVER_HOST**: Hostname or IP (e.g. `myserver.com` or `123.45.67.89`).
   - **SERVER_USER**: SSH user (e.g. `root` or `deploy`).
   - **SERVER_PACKAGES_PATH** (optional): Remote directory for templates. Default is `packages` (relative to SSH user’s home). For the app at `/opt/remote-support`, use **`/opt/remote-support/packages`** so the backend finds `support-template.exe` and `support-template.dmg`.

3. After the next push to `main` (or manual run), the workflow builds both installers and then SCPs them to the server. The deploy job is skipped if `DEPLOY_SSH_KEY` is not set.

## Which workflow to use

- **Push to main / auto-deploy:** Use **Build Helper (Win + Mac)**. It runs on every push to `main`, syncs version from root, builds both EXE and DMG, then runs the deploy job if secrets are set. Do not use "Build macOS DMG" or "Build Windows EXE" for that—they are manual-only and do not run deploy.
- **Mac build (robotjs):** The helper uses Electron 28 so that robotjs prebuilds work on macOS runners (Electron 30.x can trigger "Could not detect abi" and a slow source build).
