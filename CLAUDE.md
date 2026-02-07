# Remote Support Platform — Claude Code Guide

## What This Project Is

Browser-based remote support platform. A technician logs into a web dashboard, generates a support package (Windows EXE / macOS DMG), sends it to a customer. The customer runs the helper, which connects back via WebRTC for screen sharing and Socket.io for signaling, mouse/keyboard relay, and file transfer. Self-hosted, single-server deployment.

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js, Express, Socket.io, PostgreSQL, Redis (optional), JWT + express-session |
| Frontend | React 18, Vite, Socket.io-client, WebRTC |
| Helper | Electron (main + renderer + preload), screen capture, optional robotjs |
| CI/CD | GitHub Actions (`build-helper.yml`), PM2 in production |
| Auth | JWT tokens, bcrypt passwords, session middleware on protected routes |

## Project Structure

```
backend/
  server.js              # Entry point
  routes/                # Express routers: auth, devices, files, monitors, packages, sessions, version, websocket
  services/              # Core logic: websocketHandler, sessionService, packageBuilder, cleanup, approvalHandler, vncBridge
  middleware/            # Auth middleware (requireAuth)
  models/               # DB models
  config/               # DB/app config
  scripts/              # migrate.js, create-test-technician.js
frontend/
  src/pages/             # Dashboard.jsx, SessionView.jsx, Login.jsx, Register.jsx
  src/App.jsx            # Router
helper/                  # Electron app (built via GitHub Actions into EXE/DMG)
  src/                   # main, renderer, preload
scripts/
  sync-version.js        # Syncs version from root package.json → frontend + helper
docs/                    # All project documentation (see docs/DOCUMENTATION_INDEX.md)
packages/                # Generated support packages (gitignored)
uploads/                 # File uploads (gitignored)
tests/
  smoke.js               # Smoke test
```

## Key Commands

```bash
npm run dev              # Start backend with nodemon
npm start                # Start backend (production)
npm run build            # Build frontend (cd frontend && npm install && npm run build)
npm run migrate          # Run DB migrations
npm run create-test-user # Create test technician account
npm run version:sync     # Sync version from root package.json to helper + frontend
npm test                 # Smoke test
npm run deploy           # Run deploy.sh
```

## Production

- PM2 process name: `remote-support-backend`
- Restart backend: `pm2 restart remote-support-backend`
- Frontend serves from `frontend/dist/` (static, built by Vite)
- Env vars: see `.env.example` — never commit `.env`

## Versioning

- **Single source of truth**: root `package.json` (currently `1.0.1`)
- Run `npm run version:sync` after bumping to sync helper + frontend
- CI release uses git tags (`v1.0.1`)
- See `docs/VERSIONING.md` for full policy

## Conventions

### Code Style
- **Backend**: camelCase, Express router pattern, `requireAuth` middleware on protected routes
- **Frontend**: React functional components with hooks, Axios for HTTP, Socket.io-client for real-time
- **CSS**: BEM-like naming (`.dashboard-header`, `.session-card`, `.connect-btn`), dark theme for SessionView, light for Dashboard
- **No hardcoded secrets** — use `.env` and env vars

### API & Events
- REST routes in `backend/routes/`, mounted in `server.js`
- Socket.io events in `backend/services/websocketHandler.js`
- Documented in `docs/API_AND_EVENTS.md` — this is the contract

### UI Principles (see `docs/UI_GUIDELINES.md`)
- Minimalistic, functional, not confusing at scale (50-100+ users)
- Technician should find and connect in under 10 seconds
- Search filtering on Dashboard (by session ID, hostname, device name)
- Split view in SessionView: horizontal layout, portrait stacks vertically

### File Transfer
- Two-panel modal: local file browser (tree) + remote file browser (table)
- Socket.io events for file operations, base64 encoding for transfer

### Package Generation
- `backend/routes/packages.js` generates session-linked EXE/DMG
- Binary patching: replaces `___SESSID___` placeholder with actual session ID
- Templates stored in `packages/templates/`

## Key Docs

| Doc | Purpose |
|-----|---------|
| `docs/DOCUMENTATION_INDEX.md` | Entry point — reading order for all docs |
| `docs/API_AND_EVENTS.md` | REST + Socket.io contract |
| `docs/UI_GUIDELINES.md` | Dashboard/SessionView design principles |
| `docs/VERSIONING.md` | Version management policy |
| `docs/DEPLOYMENT.md` | Deployment instructions |
| `docs/DEPENDENCIES.md` | Dependency inventory |
| `docs/ROADMAP.md` | Future features |
| `CHANGELOG.md` | Release history (Keep a Changelog format) |
| `CONTRIBUTING.md` | How to contribute / onboard |
| `QUICK_START.md` | Fast setup guide |

## Agents (auto-invoke)

Project agents live in `.cursor/agents/`; when to run them is in `.cursor/skills/auto-run-agents/SKILL.md`. **You must invoke the relevant agent(s) in the same turn** when the user's message or recent context matches a trigger — do not wait for the user to name the agent.

- **Trigger examples:** User says "build and restart", "I pushed", "review my code", "ready for release", "put agents to work", or context shows recent code change / push / release intent.
- **Action:** Read `.cursor/skills/auto-run-agents/SKILL.md` and apply the Trigger → Agent mapping. For "put agents to work" / "agents suggest I approve", use the **agent-approval-workflow** skill (present todo list, then execute only accepted items). For "build frontend" / "restart backend" or after frontend/backend changes, run the **build-restart** agent (execute `npm run build` and/or `pm2 restart remote-support-backend` yourself).
- **Do not skip** unless the user explicitly says not to run agents.

## Before Making Changes

1. Read the relevant files before modifying — understand existing patterns
2. Protected routes must use `requireAuth` middleware
3. After frontend changes → `npm run build`
4. After backend changes → `pm2 restart remote-support-backend` (production)
5. After version bump → `npm run version:sync`
6. Don't commit `.env`, secrets, or `node_modules`
7. Keep `docs/API_AND_EVENTS.md` updated when adding/changing routes or socket events
