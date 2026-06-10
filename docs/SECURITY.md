# Security

## Authentication model (since 1.1.0)

| Surface | Protection |
|---------|-----------|
| Dashboard REST + pages | nginx `auth_request` (workspace SSO) or local login → `remote.sid` express-session cookie |
| Proxy identity headers | `X-User-Id`/`X-Display-Name` only trusted when the request carries `X-Proxy-Auth` = `PROXY_SHARED_SECRET` (nginx adds it only on `auth_request`-protected locations). Without the secret the headers are ignored — clients cannot forge identity through public proxy locations. |
| Socket.io | Handshake-authenticated. Technicians: session cookie (parsed by injected express-session middleware). Helpers/devices: JWT in `auth.token` (`helperToken` / `deviceToken`, signed with `JWT_SECRET`). Everything else is a receive-only "customer" socket: no control events, no cached WebRTC offers, no dashboard broadcasts. Role is derived server-side; the client-claimed role in `join-session` is ignored. |
| Approval / settings | Require `Authorization: Bearer <helperToken>` once an Electron helper socket is attached to the session. Token-less writes only allowed for legacy VNC/XP sessions (which have no helper socket) and are rate limited. |
| `/websockify` (noVNC viewer) | WebSocket upgrade requires a logged-in technician session cookie. |
| VNC listener (port 5500) | Reverse-VNC inbound from customer machines. Auto-creating sessions for unknown connections is **disabled** unless `VNC_AUTO_CREATE_SESSIONS=true`; unmapped connections are dropped. Pre-registered sessions are mapped by IP/session. |
| Unauthenticated endpoints | Per-IP fixed-window rate limiting (`backend/middleware/rateLimit.js`), 30–60 req/min. |
| Secrets | `SESSION_SECRET`, `JWT_SECRET`, `PROXY_SHARED_SECRET` come from `/srv/.env` on the host (referenced in `/srv/docker-compose.yml`). Never commit real values; rotate by regenerating in `.env` + nginx (`X-Proxy-Auth`) and restarting both containers. |

## Known limitations / backlog

- **Session binding**: `POST /api/sessions/register` issues a `helperToken` to any caller that knows a valid waiting sessionId (required for the legacy XP page). Mitigated by session-ID entropy + rate limiting. Backlog: bind a session to the first registering device and reject re-registration.
- **XP VNC stream is plaintext** on port 5500 (XP cannot do TLS 1.2+). Acceptable for the few legacy machines; do not use this path for modern Windows.
- **Express sessions are in-memory** — restart logs technicians out (they re-auth via SSO transparently).
- CSRF protection for cookie-auth routes is still backlog (mitigated by `sameSite: 'lax'`).

## npm audit

Run `npm audit` in the repo root (and in `frontend/` and `helper/`). Address **high** and **critical** before release.

```bash
npm audit fix
# or, if fixes require major upgrades:
npm audit fix --force
```

After `npm audit fix --force`, re-test authentication (login/logout) because bcrypt major upgrades can change hash compatibility.

## Practices

- **Secrets**: Use `.env` and env vars; never commit real secrets. `.env` is in `.gitignore`.
- **Auth**: Protected routes use `requireAuth`; session secret must be set in production.
- **File upload**: Multer limits and session-scoped storage; helper file ops restricted to user homedir.
- **Socket.io**: Events scoped by session room and enforced server-side per role.

For security-sensitive changes, run the **security-audit** agent (or review auth, file, and socket handling) before release.
