# Roadmap – future feature ideas

Candidate features for the Remote Support Platform. Aligned with current stack (WebRTC, Electron, Socket.io). Prioritized by impact and fit. Informed by common remote-support tools (TeamViewer, AnyDesk: session recording, chat, unattended access, file transfer, multi-monitor).

**Last updated:** 2025-02-10 (VNC/XP path and Bridge API shipped; dashboard sessions above devices, widget linkTo, case delete)

---

## Dashboard Task List (UI + Data Quality)

- [ ] **Devices: Fix geolocation from IP**
- [ ] Add server-side logging/metrics for geolocation failures and confirm correct client IP extraction behind proxies (`x-forwarded-for` parsing, strip port, pick first public IP).
- [ ] If outbound plain HTTP is blocked, add/replace a geolocation provider that supports HTTPS on free tier (keep cache).
- [ ] Persist geo on device register and refresh it when `last_ip` changes.
- [ ] **Devices: Actions button layout**
- [ ] Make `Edit`, `Request`, `Remove` buttons sit on one row, same height, same width, consistent spacing.
- [ ] Apply the same visual rules for `Save`/`Cancel` when editing.

- [ ] **Active Sessions: Show Customer + Machine**
- [ ] Update active session cards to render `Customer / Machine` next to the session ID, bold.
- [ ] Ensure the active sessions API includes `customer_name`, `machine_name`, and `location` (join devices) so frontend does not guess from hostname.
- [ ] Snapshot customer/machine into `sessions.customer_name` / `sessions.machine_name` at connect time when possible (device lookup) so stats remain stable even if device names later change.

- [ ] **Statistics: Duration and Correct Fields**
- [ ] Fix session duration calculation so it never goes negative (do not overwrite `connected_at` after first set; or compute from a stable start timestamp).
- [ ] Ensure `ended_at` is set only when the session truly ends; do not set it for transient states.
- [ ] Fix statistics row mapping:
- [ ] `Customer` must come from `sessions.customer_name` or `devices.customer_name` (not hostname).
- [ ] `Machine` must come from `sessions.machine_name` or `devices.machine_name` (not hostname).
- [ ] `Location` must come from device geo (`devices.last_city/region/country`).
- [ ] Fix summary cards: `Total Duration` must always show computed sum (show `0s` when zero instead of `—`).

- [ ] **Templates: New Upload Badges + One-Time Dismiss**
- [ ] After template upload, show a "New" badge in the Helper Templates section.
- [ ] Show a balloon/badge next to toolbar `Generate Support Package` when new templates are available.
- [ ] Persist "seen" state per technician (preferences table or localStorage) so badges clear after the user views/dismisses them.
- [ ] Add a realtime event (Socket.IO) `templates-updated` emitted on template upload so the dashboard updates instantly.

- [ ] **Dashboard: "What's New" from GitHub**
- [ ] Add backend endpoint to fetch latest GitHub release notes (cache server-side with TTL; support offline/failure).
- [ ] Add dashboard UI surface: small "What's New" banner/modal with one-time dismiss per version.

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
