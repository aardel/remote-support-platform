# Dependencies

## Node version

Use **Node 18+** (LTS) for the backend and for building the frontend and helper. CI (GitHub Actions) uses Node 20.

## Layout

- **Root** (`package.json`): Backend (Express, Socket.io, auth, multer, etc.) and root-level scripts (`dev`, `start`, `build`, `test`).
- **frontend/** (`frontend/package.json`): React, Vite, axios, socket.io-client. Build output in `frontend/dist/`.
- **helper/** (`helper/package.json`): Electron, socket.io-client; **optionalDependencies** (e.g. robotjs) for mouse/keyboard control — build may succeed without them on some platforms.

## Installing

```bash
npm install
cd frontend && npm install
cd ../helper && npm install
```

## Upgrading

- Run `npm outdated` in root, frontend, and helper to see newer versions.
- For major upgrades (e.g. React, Express, Electron), check changelogs and test; document breaking changes in CHANGELOG.
- Optional deps (e.g. robotjs): documented in `helper/README.md`; helper works with reduced functionality if missing.

## Audit

Run `npm audit` and fix high/critical. See `docs/SECURITY.md` for current notes and mitigation.
