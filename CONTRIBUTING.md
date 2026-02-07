# Contributing to Remote Support Platform

Thanks for contributing. This doc gets you from clone to first PR quickly.

## Get the repo and run it

```bash
git clone https://github.com/aardel/remote-support-platform.git
cd remote-support-platform
npm install
cd frontend && npm install && cd ..
cd helper && npm install && cd ..
```

**Run the app:**

```bash
# From repo root: backend + frontend dev server (if applicable) or build frontend and run backend only
npm run dev
```

Server runs at `http://localhost:3000` (or port in env). Build frontend for production:

```bash
npm run build
# Serves from frontend/dist; backend serves it when running node backend/server.js
```

**Helper (Electron):** From `helper/`: `npm run start` (dev) or use the built EXE/DMG from GitHub Actions.

## Where to change what

| If you want to… | Look here |
|-----------------|-----------|
| Add/change an API route | `backend/routes/` and mount in `backend/server.js` |
| Add/change a Socket.io event | `backend/services/websocketHandler.js`; then frontend + helper |
| Change dashboard (sessions, devices, packages) | `frontend/src/pages/Dashboard.jsx` |
| Change session view (video, files, controls) | `frontend/src/pages/SessionView.jsx` |
| Change helper app (capture, IPC, socket) | `helper/src/main.js`, `renderer/renderer.js`, `preload.js` |
| Update API/event contract doc | `docs/API_AND_EVENTS.md` |
| Bump version / keep versions in sync | Edit `version` in root `package.json`, then run `npm run version:sync`. See [docs/VERSIONING.md](docs/VERSIONING.md). |

## Tests

```bash
npm test
```

If no tests exist yet, add them for critical paths (auth, sessions, file upload). See `docs/` for architecture.

## Proposing changes

1. Create a branch from `main` (e.g. `feature/session-search` or `fix/file-upload`).
2. Make your changes; keep commits focused.
3. Open a pull request against `main`. Describe what and why.
4. After review (if applicable), merge. Then deploy: pull on server, restart backend (e.g. `pm2 restart remote-support-backend`), rebuild frontend if needed.

## Code style

- Follow existing style in the file you edit (camelCase, async/await, React function components).
- Backend: `backend/routes/` for HTTP, `backend/services/` for logic.
- Frontend: `frontend/src/pages/` for top-level pages; keep components and state clear.
- Helper: main process for Node/fs/socket; renderer for UI; preload for safe IPC.

## More

- **Deployment:** `docs/DEPLOYMENT.md`, `DEPLOY_TO_SERVER.md`
- **API and Socket.io:** `docs/API_AND_EVENTS.md`
- **Quick start:** `QUICK_START.md`
