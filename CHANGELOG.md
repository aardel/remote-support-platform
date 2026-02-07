# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

- (Next release)

---

## [1.0.2] – 2025-02-07

### Added

- **Helper: connected technicians list** — Helper window shows who is viewing: "Connected: Technician (Name)" with one chip per technician (e.g. Aaron Delia, Jane Smith). Multiple technicians can be connected; list updates on join/leave. See `docs/API_AND_EVENTS.md` (technician-joined, technician-left, technicians-present).
- **Agents and automation** — CI workflow (build frontend + smoke test on push/PR to main). CLAUDE.md enforces auto-invoke of project agents when context matches. `docs/AGENTS_AUTOMATION.md` and README/CONTRIBUTING describe `.cursor/` (versioned) and what runs on push vs in Cursor chat.
- **Session UI: fullscreen viewer + control panel** — Two-window session: viewer tab can go fullscreen (video only); control panel opens as popup with monitor, stream quality, split view, chat, files, minimize, exit fullscreen, disconnect. SessionView and panel communicate via BroadcastChannel (`session-control-{sessionId}`). Chat and file transfer moved into control panel; `chat.html` removed. See `docs/NEW_INTERFACE.md`.
- **In-fullscreen fallback bar** — When in fullscreen, a bar at the bottom always shows Exit fullscreen, Open controls, Disconnect so the user is never stuck if the control panel popup is blocked or behind the fullscreen window.
- Stream quality preset: Best quality / Balanced / Optimize for speed (technician dropdown; helper applies encoding).
- Split view for vertical monitors: show top and bottom halves of remote screen side by side.
- Remote file browser: list directories on user PC (helper), two-panel file transfer with Send → and ← Receive.
- Mouse and keyboard control: technician controls user PC via robotjs in helper.
- Monitor selection: technician can switch which display the helper captures (multi-monitor).
- Session assign by device: helper gets session from server on launch (no manual session ID); same device reuses session.
- WebRTC screen sharing (replacing VNC): getDisplayMedia in helper, peer connection with technician dashboard.
- Real-time session status updates in dashboard (Socket.io).
- Upload progress bar for helper template uploads.
- Session delete in dashboard.
- GitHub Actions: Build Windows EXE and macOS DMG on push to main.
- Same-machine SSH development note in docs.

### Changed

- Fullscreen flow: control panel opens before requesting fullscreen so the popup does not steal focus and cause immediate fullscreen exit; optional focus of popup after fullscreen to bring it to front.
- Backend tracks multiple technicians per session (array of technicianId/technicianName) for helper display; join-session from technician now sends technicianId and technicianName (from logged-in user).
- Helper UI minimized: session + Start/Disconnect + optional file notification; monitor and file controls moved to technician.
- Mouse coordinate mapping fixed for object-fit contain so cursor matches remote video.
- WebRTC offer/answer and ICE candidate handling fixed for Electron IPC and late-joining technicians.

### Fixed

- **Viewer: disable non-active monitors** — Monitor dropdown in SessionView and control panel now disables options beyond the customer’s display count (single or dual monitor). Helper sends `displayCount` in capabilities; viewer clamps selection and shows “(not available)” for extra options.
- **Helper: single-monitor Mac captured one window** — Desktop capture now requests only `types: ['screen']`, so the full display is captured on single-monitor Macs instead of a random window.
- **Helper: macOS “Could not start video source”** — On-screen hint on Mac about Screen Recording permission; clearer error and log message directing users to System Settings → Privacy & Security → Screen Recording. Troubleshooting section in `docs/HELPER_UPDATES.md`.
- **Black screen in session viewer** — ICE candidates from the helper were sometimes dropped because they arrived before React updated the peer connection state. SessionView now uses a ref for the peer connection so all ICE candidates are applied and the stream connects reliably.
- WebRTC object serialization for IPC in helper.
- Socket.io loading in Electron helper.
- Real-time session status and session-ended handling in dashboard.

---

## [1.0.1] – 2025-02-06

### Added

- **Versioning**: Single canonical version in root `package.json`; `npm run version:sync` keeps helper and frontend in sync. Dashboard shows version in footer; helper shows version in window. `GET /api/version` returns app version.
- **version-steward agent**: Cursor agent (`.cursor/agents/version-steward.md`) that handles bump, sync, and version docs so the team doesn’t manage versioning by hand.
- **Agent approval workflow**: “Put agents to work” produces a todo list; human accepts/declines; only accepted items run. Full agent team (docs, changelog, api-contracts, testing, security, devops, version-steward, etc.) can be run in suggestion mode.

---

## [1.0.0] – earlier

- Initial backend (Express, Socket.io), dashboard (React), and VNC-based support flow.
- Auth, sessions, packages, file transfer, connection approval.
- Migration to WebRTC and Electron helper in subsequent work above.
