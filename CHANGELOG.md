# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

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

- Helper UI minimized: session + Start/Disconnect + optional file notification; monitor and file controls moved to technician.
- Mouse coordinate mapping fixed for object-fit contain so cursor matches remote video.
- WebRTC offer/answer and ICE candidate handling fixed for Electron IPC and late-joining technicians.

### Fixed

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
