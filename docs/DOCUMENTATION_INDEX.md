# Documentation Index

Entry point for all project documentation. The app uses **WebRTC + Electron** for screen sharing and control. An **optional VNC path** (TightVNC reverse connection + noVNC in browser) supports Windows XP and legacy browsers; chat and file transfer for those sessions use the **Bridge API** (see API_AND_EVENTS.md). Older VNC-era docs in "Legacy / reference" are kept for reference only.

---

## Start here

| Doc | Purpose |
|-----|---------|
| **README.md** (root) | Project overview, quick start, key features |
| **QUICK_START.md** | Detailed setup and first run |
| **CONTRIBUTING.md** | Clone, install, run, test, where to change what, PR flow |

---

## Current stack (WebRTC + Electron)

| Doc | Purpose |
|-----|---------|
| **API_AND_EVENTS.md** | REST routes and Socket.io events (single source of truth) |
| **DEPLOYMENT.md** | Production deploy, PM2, nginx |
| **HELPER_UPDATES.md** | Helper upgrade prompt (Upgrade now / Next session), API, troubleshooting (e.g. macOS Screen Recording) |
| **UI_GUIDELINES.md** | Dashboard and session UI principles, responsive header, backlog (search, filter, scale) |
| **ROADMAP.md** | Future feature ideas (quick wins, medium, larger) |
| **VERSIONING.md** | Single canonical version (root package.json), sync, bump and release |
| **NEW_INTERFACE.md** | Session UI: in-page overlay, fullscreen, control panel |
| **DASHBOARD_REDESIGN_PLAN.md** | Widget dashboard, dedicated pages (Statistics, Devices, Sessions, Templates), Generate modal |
| **AGENTS_AUTOMATION.md** | CI on push, when agents run (Cursor chat), automation options |
| **DEPENDENCIES.md** | Node version, package layout |
| **SECURITY.md** | npm audit, security practices |
| **CODE_REVIEW_NOTES.md** | Short code-review notes from agents (recent changes) |
| **XP_BUNDLES.md** | Windows XP support package contents and flow (if present) |

---

## Optional: VNC/XP path

For Windows XP or legacy browsers that cannot use the Electron helper or TLS 1.2+, the app supports a **VNC path**: customer runs a support package (ZIP with TightVNC + batch/VBS scripts), reverse-connects to the server; technician views via noVNC in SessionView. Chat and files use the Bridge API (HTTP). See **API_AND_EVENTS.md** (Bridge, vnc-ready/vnc-disconnected).

---

## Feature and reference (current)

| Doc | Purpose |
|-----|---------|
| **CONNECTION_APPROVAL_SECURITY.md** | Approval flow, unattended vs manual |
| **MULTI_MONITOR_SUPPORT.md** | Monitor selection and switching |
| **FILE_TRANSFER_SUPPORT.md** | File transfer implementation (two-panel, remote browser) |
| **AUTOMATED_PACKAGE_SYSTEM.md** | Package generation, templates |
| **COMPATIBILITY.md** | Windows/browser compatibility |
| **GITHUB_ACTIONS_HELPER.md** | Helper build (EXE/DMG) via GitHub Actions |

---

## Legacy / reference (VNC-era)

These docs describe an older or alternative design. The **current** path is WebRTC + Electron helper; use the “Current stack” section above for implementation.

| Doc | Note |
|-----|------|
| **FINAL_ARCHITECTURE.md** | Historical; architecture has evolved to WebRTC + Electron |
| **VNC_HYBRID_SOLUTION.md** | VNC/TightVNC; not used in current WebRTC flow |
| **NETWORKING_NO_PORT_FORWARD.md** | VNC reverse connection; current app uses WebRTC + server signaling |
| **SIMPLE_CUSTOMER_UI.md** | Old customer UI; current customer flow is support page + helper app |
| **FEASIBILITY_ASSESSMENT.md** | Early feasibility; kept for reference |

---

## Changelog and version

- **CHANGELOG.md** (root) — Release history, Unreleased section
- **docs/VERSIONING.md** — How to bump and sync version

---

## Next steps for new developers

1. Read **README.md** and **QUICK_START.md**.
2. Run the app: `npm install`, `npm run dev` (see CONTRIBUTING.md).
3. Use **docs/API_AND_EVENTS.md** for any API or Socket.io work.
4. Use **docs/UI_GUIDELINES.md** and **docs/ROADMAP.md** for UI and roadmap context.
