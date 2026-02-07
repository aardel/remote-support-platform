# Remote Desktop Support Platform

Browser-based remote support: technicians use a web dashboard to view and control user PCs via an Electron helper app. WebRTC for screen sharing, Socket.io for signaling, full mouse/keyboard control, and two-panel file transfer. Self-hosted; no port forwarding.

## Vision

- **Technician**: Web dashboard (React) — sessions, devices, connect, stream quality, split view, file browser
- **User**: Runs the helper (Electron EXE/DMG) once; session is assigned by device; minimal UI (Start/Disconnect)
- **Screen + control**: WebRTC screen share; mouse/keyboard control via helper (robotjs)
- **File transfer**: Two-panel (your computer ↔ remote); remote file browser (list/send/receive)
- **Multi-monitor**: Technician switches which display is shared; stream quality preset (Best / Balanced / Speed); split view for vertical monitors
- **Self-hosted**: Your server, your data; optional connection approval

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Set up environment variables (optional for local dev)
cp .env.example .env

# Start development server
npm run dev
```

Server runs on `http://localhost:3000`

See `QUICK_START.md` for detailed setup and testing instructions.

### Same-machine development (SSH)

This project can be developed and run on the **same server** over SSH: you edit, commit, push, and run the backend on one host. There is no separate “local” vs “deploy” step: after changing backend code, restart the process (e.g. `pm2 restart remote-support-backend`) to load it. Helper builds (EXE/DMG) are produced by GitHub Actions when you push to `main`.

### Production Deployment

See `docs/DEPLOYMENT.md` for complete deployment guide.

## Project Structure

```
Remote Desktop Server/
├── backend/                  # ✅ Node.js backend (Complete)
│   ├── routes/              # API routes
│   ├── services/            # Business logic
│   ├── models/              # Database models
│   ├── config/              # Configuration
│   └── server.js            # Main server
├── frontend/                 # ✅ React frontend (Complete)
│   ├── src/                 # React source
│   │   └── pages/           # Dashboard pages
│   └── public/              # Customer UI
├── docs/                     # ✅ All documentation
│   ├── FINAL_ARCHITECTURE.md
│   ├── VNC_HYBRID_SOLUTION.md
│   ├── DEPLOYMENT.md
│   └── ...
├── packages/                 # Generated packages
├── uploads/                  # File uploads
└── README.md                 # This file
```

## Key Features

- ✅ **WebRTC screen sharing** (Electron helper captures display; technician views in browser)
- ✅ **Mouse/keyboard control** (robotjs in helper; technician sends events via Socket.io)
- ✅ **Session by device** (same device reuses session; no manual session ID)
- ✅ **Remote file browser** (list dirs on user PC; Send → / ← Receive; two-panel UI)
- ✅ **Multi-monitor** (technician switches display); **stream quality** (Best / Balanced / Speed); **split view** (vertical monitors: top/bottom side by side)
- ✅ **File transfer** (upload/download, session-scoped; file-available notification to helper)
- ✅ **Connection approval** (optional manual approval before connect)
- ✅ **Self-hosted** (Node backend, React dashboard, Electron helper; no port forwarding)
- ✅ **Helper builds** (GitHub Actions: Windows EXE, macOS DMG on push to main)

## Technology Stack

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: React, Vite (technician dashboard)
- **Helper**: Electron (screen capture, getDisplayMedia, robotjs optional, Socket.io client)
- **Signaling**: Socket.io (WebRTC offer/answer/ICE, remote control, file browser events)
- **Infrastructure**: Self-hosted (e.g. PM2, nginx); optional PostgreSQL

## Architecture Overview

```
Technician browser (React) ←→ Server (Express + Socket.io) ←→ User PC (Electron helper)
                                  ↑
                            WebRTC (video) + Socket.io (signaling, mouse/keyboard, file ops)
```

- **Technician**: Dashboard lists sessions/devices; connect opens SessionView (video, controls, files).
- **Server**: REST API + Socket.io; forwards events between technician and helper by session.
- **Helper**: Assigns session, captures screen (WebRTC), injects mouse/keyboard, handles file list/get/put (homedir-scoped).

## Development Workflow

1. **Develop locally** → Test → Commit → Push to GitHub
2. **Deploy to server** → Pull from GitHub → Install → Start services
3. **Automated deployment** → GitHub Actions (optional)

See `docs/DEPLOYMENT.md` for detailed deployment instructions.

## Packaging (CI)

Helper installers (Windows EXE, macOS DMG) are built by GitHub Actions.

**Automated (recommended)**
- **Push to `main`** → workflow **Build Helper (Win + Mac)** runs and builds both. One run → two artifacts: `helper-exe` and `helper-dmg`.
- **Push a tag `v*`** (e.g. `git tag v1.0.0 && git push origin v1.0.0`) → same build plus a **GitHub Release** is created with the EXE and DMG attached. Download from the Releases page.

**Manual run**
1. GitHub → **Actions** → **Build Helper (Win + Mac)** → **Run workflow**.
2. When it finishes, open the run and download **helper-exe** and **helper-dmg**.
3. Upload them in the dashboard under **Helper Templates** (EXE and DMG), or copy to server `packages/` as `support-template.exe` and `support-template.dmg`.

**Automatic deploy to server**
- When repo secrets are set (`DEPLOY_SSH_KEY`, `SERVER_HOST`, `SERVER_USER`; optional `SERVER_PACKAGES_PATH`, e.g. `/opt/remote-support/packages`), every successful build **uploads the latest EXE and DMG to the server** as `support-template.exe` and `support-template.dmg`. No manual download or dashboard upload. See `docs/GITHUB_ACTIONS_HELPER.md`.

After templates are on the server, new sessions get `packages/support-<SESSION_ID>.<ext>` for download.

## Documentation

- **API and Socket.io**: [docs/API_AND_EVENTS.md](docs/API_AND_EVENTS.md) — REST routes and Socket.io events (single source of truth)
- **Contributing**: [CONTRIBUTING.md](CONTRIBUTING.md) — How to run, where to change what, PR flow
- **Changelog**: [CHANGELOG.md](CHANGELOG.md) — Release history
- **UI guidelines**: [docs/UI_GUIDELINES.md](docs/UI_GUIDELINES.md) — Dashboard/session UI principles and backlog
- **Roadmap**: [docs/ROADMAP.md](docs/ROADMAP.md) — Future feature ideas
- **Security**: [docs/SECURITY.md](docs/SECURITY.md) — npm audit and practices
- **Dependencies**: [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md) — Node version and packages
- **Versioning**: [docs/VERSIONING.md](docs/VERSIONING.md) — Single canonical version, sync to helper and web app, bump and release flow
- **Full index**: [docs/DOCUMENTATION_INDEX.md](docs/DOCUMENTATION_INDEX.md) — Guide to all documentation
- **Direct instructions**: [docs/INSTRUCTIONS.md](docs/INSTRUCTIONS.md) — Copy-paste steps for GitHub description and commit

**Maintainers:** Agents and skills live in [.cursor/](.cursor/) and are **versioned in the repo** so automation rules are shared. [.cursor/agents/](.cursor/agents/) (changelog, version-steward, docs-steward, code-reviewer, etc.) help keep docs, versioning, and release flow consistent — see `.cursor/agents/README.md`. When to run them: `.cursor/skills/auto-run-agents/SKILL.md`. Full picture: [docs/AGENTS_AUTOMATION.md](docs/AGENTS_AUTOMATION.md).

Other docs in the `docs/` folder:

- **docs/FINAL_ARCHITECTURE.md**: Complete overview of final decisions and architecture
- **docs/VNC_HYBRID_SOLUTION.md**: VNC implementation details and Windows XP support
- **docs/DEPLOYMENT.md**: Deployment guide (local → GitHub → server)
- **docs/SIMPLE_CUSTOMER_UI.md**: Simple UI design with security features
- **docs/NETWORKING_NO_PORT_FORWARD.md**: Reverse connection setup (no port forwarding)
- **docs/AUTOMATED_PACKAGE_SYSTEM.md**: Package generation system
- **docs/CONNECTION_APPROVAL_SECURITY.md**: Security approval feature
- **docs/MULTI_MONITOR_SUPPORT.md**: Monitor selection and switching
- **docs/FILE_TRANSFER_SUPPORT.md**: File transfer implementation
- **docs/COMPATIBILITY.md**: Windows version support (XP+)
- **docs/FEASIBILITY_ASSESSMENT.md**: Project feasibility analysis
- **docs/DOCUMENTATION_INDEX.md**: Guide to all documentation

## Advantages Over TeamViewer

1. ✅ **No install per session** (TightVNC once vs. TeamViewer every time)
2. ✅ **Windows XP support** (TeamViewer doesn't support XP)
3. ✅ **Self-hosted** (full control vs. cloud dependency)
4. ✅ **No port forwarding** (easier for users)
5. ✅ **Customizable** (build features you need)
6. ✅ **Cost-effective** (free vs. paid subscription)
7. ✅ **Better workflow** (unified dashboard)
8. ✅ **Connection approval** (extra security layer)

## Project Status

### ✅ **Ready for testing**

**What's built:**
- Backend (Express + Socket.io), technician dashboard (React), Electron helper (WebRTC, file browser, mouse/keyboard)
- Session-by-device, stream quality, split view, remote file transfer, multi-monitor
- Auth, connection approval, package generation, GitHub Actions (EXE/DMG builds)

See `PROJECT_STATUS.md` for details; `docs/API_AND_EVENTS.md` for API and Socket.io.

## Next steps

1. Install: `npm install`, `cd frontend && npm install`, `cd ../helper && npm install`
2. Run: `npm run dev` (or build frontend + PM2 for production)
3. Deploy: `docs/DEPLOYMENT.md`

## Questions?

See the detailed documentation in the `docs/` folder:
- Start with `docs/FINAL_ARCHITECTURE.md` for complete overview
- See `docs/DEPLOYMENT.md` for deployment instructions
- See `docs/DOCUMENTATION_INDEX.md` for navigation guide
