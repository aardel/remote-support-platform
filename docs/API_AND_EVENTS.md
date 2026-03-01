# API and Socket.io contract

Single source of truth for REST routes and Socket.io events. Keep this in sync when adding or changing endpoints or events.

**Base URL:** `/api` for REST. Socket.io connects to server origin.

---

## REST API

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| **System** | | | |
| GET | /api/health | No | Health check (status, timestamp) |
| GET | /api/version | No | App version and name (from root package.json) |
| **Auth** | | | |
| GET | /api/auth/login | No | Start OAuth or show login |
| GET | /api/auth/callback | No | OAuth callback |
| GET | /api/auth/me | Session | Current user |
| GET | /api/auth/logout | No | Logout |
| POST | /api/auth/local/register | No | Register (local auth) |
| POST | /api/auth/local/login | No | Login (local auth) |
| **Sessions** | | | |
| POST | /api/sessions/assign | No | Assign session by deviceId (helper) |
| POST | /api/sessions/create | Yes | Create session (technician) |
| GET | /api/sessions/:sessionId | No | Get session |
| POST | /api/sessions/register | No | Register session (helper) |
| PATCH | /api/sessions/:sessionId/settings | No | Update session settings |
| POST | /api/sessions/:sessionId/connect | Yes | Request connect (technician) |
| POST | /api/sessions/:sessionId/approval | No | Approval response |
| GET | /api/sessions | Yes | List sessions |
| DELETE | /api/sessions/:sessionId | Yes | Delete session |
| **Packages** | | | |
| GET | /api/packages/templates | Yes | Template status (EXE/DMG) |
| POST | /api/packages/templates | Yes | Upload template |
| POST | /api/packages/generate | Yes | Generate support package |
| GET | /api/packages/manifest/:sessionId | No | Package manifest |
| GET | /api/packages/download/:sessionId | No | Download package |
| **Files** | | | |
| POST | /api/files/upload | No | Upload file (sessionId in body) |
| GET | /api/files/download/:fileId | No | Download file |
| GET | /api/files/session/:sessionId | No | List files for session |
| **Monitors** | | | |
| GET | /api/monitors/session/:sessionId | Yes | Get monitor info |
| POST | /api/monitors/session/:sessionId/switch | Yes | Switch monitor (monitorIndex) |
| **Devices** | | | |
| POST | /api/devices/register | No | Register device (helper) |
| GET | /api/devices/pending/:deviceId | No | Pending session for device |
| GET | /api/devices | Yes | List devices |
| DELETE | /api/devices/:deviceId | Yes | Deregister device |
| PATCH | /api/devices/:deviceId | Yes | Update device (customerName, machineName) |
| POST | /api/devices/:deviceId/request | Yes | Request session for device |
| **Cases** | | | |
| GET | /api/cases | Yes | List cases (Online Cases page) |
| POST | /api/cases | Yes | Create case (sessionId, deviceId, description, …) |
| GET | /api/cases/:caseId | Yes | Get case by ID |
| DELETE | /api/cases/:caseId | Yes | Delete case |
| GET | /api/cases/:caseId/pdf | Yes | Export case report PDF |
| **Bridge** (HTTP fallback for XP / VNC-only sessions) | | | |
| GET | /api/bridge/:sessionId/messages | No | Get chat messages (query: since=timestamp) |
| POST | /api/bridge/:sessionId/messages | No | Post message (body: message, sender?); server emits chat-message to room |
| GET | /api/bridge/:sessionId/files | No | List files for session (query: direction?) |
| GET | /api/bridge/:sessionId/files/:fileId/download | No | Download file |
| POST | /api/bridge/:sessionId/files/upload | No | Upload file (multipart); server emits file-available to room |
| **Preferences** | | | |
| GET | /api/preferences | Yes | Get technician preferences (dashboard layout, session history retention) |
| PUT | /api/preferences | Yes | Update preferences (body: dashboardLayout?, sessionHistoryRetentionDays?) |
| **Statistics** | | | |
| GET | /api/statistics/sessions | Yes | List sessions with filters (from, to, customer, deviceId, status); for stats page |
| **Websocket** | | | |
| GET | /api/websocket/info | No | Socket.io connection info |
| **Helper update** | | | |
| GET | /api/helper/update-info | No | Query: platform=win\|darwin, currentVersion=X.Y.Z. Returns updateAvailable, latestVersion, downloadUrl. Used by helper to prompt "Upgrade now or next session". |
| GET | /api/helper/download/:platform | No | Serves latest helper installer (win → .exe, darwin → .dmg). No auth. |

---

## Socket.io events

All events are scoped by session: clients join `session-${sessionId}` via `join-session`. **Technician** = dashboard browser; **Helper** = Electron app on user PC.

| Event | Who sends | Who receives | Payload | Purpose |
|-------|-----------|--------------|---------|---------|
| join-session | Both | Server (room) | sessionId, role; technician: technicianId?, technicianName? | Join session room; technician name shown in helper |
| leave-session | Both | Server | sessionId | Leave room |
| technicians-present | Server | Helper | sessionId, technicians: [{ technicianId, technicianName }] | Current technicians when helper joins |
| technician-joined | Server | Room (helper) | sessionId, technicianId, technicianName | A technician joined; helper shows name |
| technician-left | Server | Room (helper) | sessionId, technicianId, technicianName | A technician left; helper updates list |
| helper-capabilities | Helper | Technician(s) | sessionId, capabilities: { robotjs, platform, displayCount } | Helper sends once after connect; technician uses displayCount to disable non‑active monitor options. |
| webrtc-offer | Helper | Technician | sessionId, offer | WebRTC offer |
| webrtc-answer | Technician | Helper | sessionId, answer | WebRTC answer |
| webrtc-ice-candidate | Both | Other peer | sessionId, candidate, role | ICE candidate |
| remote-mouse | Technician | Helper | sessionId, type, x, y, button | Mouse event (0–1 coords) |
| remote-keyboard | Technician | Helper | sessionId, type, key, code, ctrlKey, … | Keyboard event |
| remote-clipboard | Technician | Helper | sessionId, text | Paste technician’s clipboard on user PC (helper sets clipboard + Ctrl/Cmd+V) |
| set-stream-quality | Technician | Helper | sessionId, quality | quality \| balanced \| speed |
| list-remote-dir | Technician | Helper | sessionId, path, requestId | List dir on user PC |
| list-remote-dir-result | Helper | Technician | sessionId, requestId, list, error? | Dir listing |
| get-remote-file | Technician | Helper | sessionId, path, requestId | Read file on user PC |
| get-remote-file-result | Helper | Technician | sessionId, requestId, content?, name?, error? | File content (base64) |
| put-remote-file | Technician | Helper | sessionId, path, filename, content, requestId | Write file on user PC |
| put-remote-file-result | Helper or Server | Technician | sessionId, requestId, success, error?; when server stored file (VNC-only): stored: true, fileId | Write result; if no helper, server stores and responds with stored: true |
| vnc-ready | Server | Technician (session room) | sessionId | VNC connection established; SessionView switches to noVNC iframe |
| vnc-disconnected | Server | Technician (session room) | sessionId | VNC connection closed |
| switch-monitor | Technician (via HTTP then server) | Helper | sessionId, monitorIndex | Switch capture display |
| file-available | Server | Helper | sessionId, id, downloadUrl, … | Notify file for download |
| approval-response | Helper? | Server | sessionId, approved | User approval |
| peer-joined | Server | Room | role, sessionId | Peer joined |
| peer-disconnected | Server | Room | role, sessionId | Peer left |

---

## Frontend / Helper usage

- **Dashboard**: GET /api/sessions, /api/devices, POST /api/sessions/:id/connect, POST /api/packages/generate, etc. Socket: join-session (technician), webrtc-answer, webrtc-ice-candidate, remote-mouse, remote-keyboard, set-stream-quality, list-remote-dir, get-remote-file, put-remote-file, and result events.
- **SessionView**: Same socket events for active session; GET /api/files/session/:id, POST /api/files/upload, GET /api/monitors/session/:id/switch (POST). For VNC-only sessions: vnc-ready, vnc-disconnected; GET /api/bridge/:sessionId/files and GET /api/bridge/:sessionId/files/:fileId/download for file list and download.
- **Helper**: POST /api/sessions/assign, POST /api/sessions/register, Socket: join-session (helper), helper-capabilities (sessionId, capabilities: robotjs, platform, displayCount), webrtc-offer, webrtc-ice-candidate, receives remote-mouse, remote-keyboard, set-stream-quality, list-remote-dir, get-remote-file, put-remote-file, switch-monitor, file-available, technicians-present, technician-joined, technician-left (to show “Connected: Technician (Name)” list).
- **XP / VNC-only (no Electron)**: POST /api/sessions/register, GET/POST /api/bridge/:sessionId/messages, GET /api/bridge/:sessionId/files, POST /api/bridge/:sessionId/files/upload, GET /api/bridge/:sessionId/files/:fileId/download. Chat and files via HTTP; technician uses noVNC iframe and SessionView file panel.

Last updated: 2025-02-10
