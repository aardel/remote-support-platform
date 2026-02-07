# Roadmap – future feature ideas

Candidate features for the Remote Support Platform. Aligned with current stack (WebRTC, Electron, Socket.io). Prioritized by impact and fit. Informed by common remote-support tools (TeamViewer, AnyDesk: session recording, chat, unattended access, file transfer, multi-monitor).

**Last updated:** 2025-02-07 (prioritized; monitor dropdown displayCount done)

---

## Quick wins

- **Dashboard search and filter**: ✅ Search implemented; status filter and sort still in backlog. See `docs/UI_GUIDELINES.md`.
- **Monitor dropdown (displayCount)**: ✅ SessionView and control panel only enable monitor options that exist on the customer’s machine (single/dual); helper sends `displayCount` in capabilities.
- **Session/device sort**: By status, date, hostname.
- **Clipboard sync**: Send clipboard text between technician and user (Socket event + helper paste).
- **Reconnect on disconnect**: Auto-reconnect or one-click reconnect when WebRTC drops.

## Medium

- **Chat or session notes**: Simple text channel or notes per session (Socket.io; optional persistence). Common in TeamViewer/AnyDesk.
- **Session recording**: Record screen + optional audio for compliance (helper captures; upload or store on server).
- **Unattended access**: Remember approval per device; optional "allow unattended" flag. Common in commercial tools.
- **Technician groups/tags**: Tag sessions or devices (e.g. "Team A", "VIP"); filter by tag.
- **Health/uptime**: Simple "last seen" or heartbeat so dashboard shows stale sessions.

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
