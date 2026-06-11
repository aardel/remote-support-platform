# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [1.1.4] – 2026-06-11

### Fixed

- **Remote cursor offset** — the technician's clicks/moves were mapped against the full `<video>` element box, but the remote frame renders with `object-fit: contain`, so it is letterboxed (empty bars) whenever the remote screen's aspect ratio differs from the on-screen panel. The mapping now uses the video's intrinsic `videoWidth`/`videoHeight` to compute the actual rendered frame rect and subtract the letterbox padding, so the injected cursor lands under the technician's pointer. (If any residual offset remains specifically on Windows at display scaling ≠ 100%, that is a separate helper-side DPI mapping to address next.)

## [1.1.3] – 2026-06-11

### Fixed

- **Helpers always showed Offline / no device ID** — the Electron installer ships without a bundled `config.json`, so `readConfig()` fell back to an empty server URL on customer machines. With no server URL the helper never registered its device and never opened the presence socket (so it stayed Offline on the dashboard), and the launch-time `assignSession` call failed, leaving the UI on "Offline — enter session ID" with a blank ID. Bake a production default (`https://servicelc.com/remote`) into the helper, still overridable by a bundled `config.json` or `SERVER_URL` env.
- **Old session links served stale installers** — `ensureSessionBinary` skipped copying when a session binary already existed, freezing a session's `.exe`/`.dmg` at whatever helper version existed when the session was created (e.g. a Mac DMG without the unblock script). Now it re-copies when the template is newer, and `GET /api/packages/download/:sessionId` refreshes the session's installers from the current template before serving.

## [1.1.2] – 2026-06-10

### Added

- **macOS unblock script in the DMG** — the helper DMG now includes a double-clickable `Fix and Open Helper.command`. Because the app is self-distributed (not notarized), macOS quarantines it on download and shows *"can't be opened because Apple cannot check it"* or, on Apple Silicon, *"is damaged and can't be opened."* The script copies the app to Applications if needed, removes the `com.apple.quarantine` flag (`xattr -dr`), re-applies an ad-hoc signature (`codesign --force --deep --sign -`, which clears the "damaged" case on Apple Silicon), and launches it. Source: `helper/dmg-resources/Fix and Open Helper.command`; wired via `build.dmg.contents`.

## [1.1.1] – 2026-06-10

### Fixed

- **Helper CI builds** — upgraded `robotjs` 0.6.0 → 0.7.x (rewritten on N-API/node-addon-api instead of the abandoned `nan`), fixing `npm install` failures on the Windows/macOS release runners and making Electron rebuilds ABI-stable. Same API surface (moveMouse, mouseToggle, scrollMouse, keyToggle, keyTap).

## [1.1.0] – 2026-06-10

### Security

- **Socket.io authentication** — handshakes are now authenticated: technicians via the `remote.sid` dashboard cookie, helpers/devices via signed JWTs (`helperToken` from `/api/sessions/assign|register`, `deviceToken` from `/api/devices/register`). Unauthenticated sockets are receive-only "customer" connections. Roles are derived server-side; control events are accepted from technicians only, capture/results from helpers only, all scoped to the joined session.
- **Proxy identity hardening** — `X-User-Id`/`X-Display-Name` headers are only trusted with the `X-Proxy-Auth` shared secret (`PROXY_SHARED_SECRET`), closing a header-forgery auth bypass through public nginx locations.
- **Approval/settings endpoints** — require the session's `helperToken` (Bearer) once an Electron helper is attached; token-less writes only for legacy VNC/XP sessions, rate limited.
- **`/websockify` (noVNC)** — WebSocket upgrade now requires a logged-in technician session.
- **VNC auto-created sessions** — disabled by default (`VNC_AUTO_CREATE_SESSIONS=true` to enable); unmapped inbound VNC connections are dropped.
- **Rate limiting** — per-IP fixed-window limits on all unauthenticated session/device endpoints.
- **Secrets** — production `SESSION_SECRET`/`JWT_SECRET` moved to strong generated values in host `.env` (placeholders removed from compose).
- Trimmed unauthenticated `GET /api/sessions/:id` to minimal status fields; dashboard broadcasts now go to the `technicians` room only.

### Added

- **Persistent agent mode (helper 1.1.0)** — helper auto-starts at login (toggle in UI, default on), keeps an authenticated presence socket with 30s heartbeats, and reconnects automatically. Dashboard Devices page and widget show live Online/Offline from socket presence (`online` flag + `device-status` event) instead of guessing from `last_seen`.
- **Instant session requests** — "Request session" on an online device pushes `pending-session` over the presence socket; the helper opens and connects without asking the user to launch it.
- **Reverse-VNC port published** — compose now publishes TCP 5500 (+ ufw rule) so the XP/TightVNC path works in the Docker deployment.

## [1.0.4 – 1.0.14] (previously listed under Unreleased)

### Added

- **VNC/XP support path** — TightVNC reverse connection with auto-created sessions when no prior registration; VNC bridge buffers data until noVNC WebSocket connects; session lookup by IP plus single-pending fallback for proxy/NAT. Windows launcher v2.2: crash protection, verbose logging, goto-based batch (XP-safe), HTTP fallback URL in config and VBScript registration/netcheck.
- **Bridge API for HTTP-only clients** — GET/POST /api/bridge/:sessionId/messages and GET /api/bridge/:sessionId/files, POST upload, GET file download. Enables chat and file transfer for XP/IE customers without Socket.io; SessionView uses bridge for file list and download in VNC-only sessions.
- **Case delete** — DELETE /api/cases/:caseId and Delete button on Cases page with confirmation.
- **SessionView VNC mode** — When VNC connects (no WebRTC), SessionView shows noVNC iframe; chat modal and file panel (bridge-backed) for VNC-only sessions; put-remote-file stored server-side when no helper.
- **Widget dashboard navigation** — Widget cards can link to a route (linkTo); click navigates unless the click is on a button, link, or input. Active Sessions, Recent Activity, Devices, Templates, Statistics, Classic Dashboard widgets wired to appropriate pages.
- **Support page and package download** — SUPPORT_URL for direct links and suggest/create origin. ZIP always regenerated on download; optional refresh=1. Content-Disposition with RFC 5987; IE download via iframe and completion cookie (dltoken). “Get latest version” checkbox on support page.
- **IE support landing** — support-landing-ie.html and support-ie.html use ___HTTPBASE___; download progress and “Open Chat Window” link to xp-chat. noVNC loaded from /customer/novnc-bundle.js (ESM).
- **Dashboard layout** — Active Sessions section moved above Registered Devices; search filters by session ID, hostname, customer name, machine name; devices show pending_session_id when present. Generate Package button moved into template card area on classic/dashboard.

### Changed

- **Package builder** — VBScript registration uses CreateHTTP() (ServerXMLHTTP then XMLHTTP), HTTP fallback URL for XP/TLS; netcheck.vbs tries primary then httpFallback; EscapeJson strips control chars; launcher opens chat URL (httpFallback/customer/xp-chat.html).
- **Case report modal** — “Skip” button and wording that report is optional for billing.
- **Chat in SessionView** — Chat available as modal and in overlay; header Chat button when connected.

---

## [1.0.3] – 2025-02-08

### Added

- **Session header: responsive layout** — Two-row header on session view: top row = session ID, status + connection timer, version, control badge, Files and Disconnect; second row (when connected) = Monitor, Stream, Split view, Fullscreen. Responsive breakpoints (768px, 480px) for smaller screens; session title truncates with ellipsis; “Files” label hidden on very small viewports.
- **Helper: connection timer shows immediately** — When a technician connects, the helper status line now shows “Connected 0:00” right away and updates every second (no longer stays on “Waiting for technician…” for the first second).

### Changed

- **Remote keyboard: document-level capture** — Typing is sent to the remote PC even when the video wrapper does not have focus. “Video area active” is set when the user clicks inside the video container; document-level keydown/keyup forward keys to the helper when active and not in an input/textarea. Fixes typing not working after clicking the remote screen.
- Session view header structure: semantic groups (session-info, session-actions, session-settings) and focusable wrapper for single-view video to improve keyboard handling.

### Fixed

- **Remote keyboard not working** — Prevent default only on contextmenu and mousedown so the video area can receive focus; added focusable wrapper div and auto-focus on connect; keyboard relay fixed after clicking header/overlay controls.
- **Helper: connection timer not visible** — Timer now sets status to “Connected 0:00” immediately when ICE connects, then updates every second.

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
