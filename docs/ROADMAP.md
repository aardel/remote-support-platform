# Roadmap – future feature ideas

Candidate features for the Remote Support Platform. Aligned with current stack (WebRTC, Electron, Socket.io). Prioritized by impact and fit. Informed by common remote-support tools (TeamViewer, AnyDesk: session recording, chat, unattended access, file transfer, multi-monitor).

**Last updated:** 2026-02-08 (audit: connection approval, status tracking, helper reconnect stability, and file-browser hardening)

---

## Quick wins

- **Manual approval (unattended OFF) end-to-end**: ✅ Helper now handles `connection-request` (Socket.IO), prompts user (Approve/Deny), and posts `/api/sessions/:sessionId/approval`.
- **Helper reconnect stability (no duplicated event handlers)**: ✅ Helper IPC subscription APIs return unsubscribe functions; renderer clears listeners on reconnect/disconnect.
- **Assign-session broadcast correctness**: ✅ `/api/sessions/assign` broadcasts the real session status (no more forcing `waiting` for already-connected sessions).
- **Register-session robustness**: ✅ `/api/sessions/register` returns 404 if session does not exist (avoids update-then-crash).
- **WebSocket presence cleanup**: ✅ `leave-session` now updates in-memory presence like `disconnect`, and server cleans up empty session state.
- **Remote file browser hardening**: ✅ Helper uses `realpath` checks to prevent escaping home directory via symlinks (case-insensitive handling on Windows).
- **CORS tightening**: ✅ Server supports `CORS_ORIGINS` allowlist; defaults to permissive when unset (dev-friendly).
- **Customer connect page correctness**: ✅ `/connect/:sessionId` page loads Socket.IO client and listens for `connection-request`; requires sessionId in URL (no random local IDs).
- **Dashboard search and filter**: ✅ Search implemented; status filter and sort still in backlog. See `docs/UI_GUIDELINES.md`.
- **Monitor dropdown (displayCount)**: ✅ SessionView and control panel only enable monitor options that exist on the customer’s machine (single/dual); helper sends `displayCount` in capabilities.
- **Session/device sort**: ✅ Sessions: sort by date (newest), status, hostname; status filter (All / Connected / Waiting). Devices: sort by last seen, name, hostname. Implemented on SessionsPage, DevicesPage, ClassicDashboard.
- **Clipboard sync**: ✅ Technician can paste their clipboard on the remote PC: “Paste” button in session header and overlay; `remote-clipboard` event; helper sets clipboard and injects Ctrl+V (or Cmd+V on Mac).
- **Reconnect on disconnect**: ✅ When "Allow unattended" is on, technician can reconnect without the user clicking again (helper stays in "Waiting for technician…"). Full auto-reconnect on WebRTC network drop still in backlog.

## Medium

- **Chat or session notes**: ✅ Simple text channel per session (Socket.io); technician and user chat in SessionView overlay; no persistence yet.
- **CSRF protection for authenticated routes**: Add CSRF protection (or strict same-origin enforcement) for cookie-auth routes, without breaking unauthenticated helper endpoints.
- **Tests for connection approval and reconnect**: Add automated coverage for approval flow (unattended off), helper reconnect status repair, and presence cleanup.
- **Session recording**: Record screen + optional audio for compliance (helper captures; upload or store on server).
- **Unattended access**: ✅ "Allow unattended connections" checkbox in helper; stored per session; when enabled, technician can leave and reconnect without user action; helper stays ready for next connection.
- **Technician groups/tags**: Tag sessions or devices (e.g. "Team A", "VIP"); filter by tag.
- **Health/uptime**: Device `last_seen` is updated on register; dashboard can order by it. Session-level "last active" or heartbeat for stale-session display still in backlog.

## Larger

- **Mobile helper**: Lightweight client (e.g. Android/iOS) that assigns session and streams screen (different from Electron; new client).
- **Plugin or webhook API**: Let external systems create sessions, get events (session started/ended), or trigger actions.
- **Multi-tenancy**: Orgs or teams; technicians see only their org’s sessions/devices.
- **Audit log**: Who connected when, duration, files transferred (for compliance).
- **Remote printing** (optional): Print from remote session to local printer—common ask; would need helper + server support.
- **Wake-on-LAN** (optional): Wake sleeping devices before connecting—niche but useful for unattended.

## Out of scope for now

- Full AI/automation (e.g. automated diagnostics); keep human-in-the-loop.
- Heavy enterprise integrations (e.g. 25+ CRM/ticketing); prefer simple webhook/API first.

## Reference

- Common in tools like TeamViewer/AnyDesk: chat, session recording, unattended access, mobile, file transfer, multi-monitor.
- This project: keep minimalistic; prefer incremental additions that fit the existing architecture.
