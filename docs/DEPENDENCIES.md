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

## Audit and outdated

Run `npm audit` and `npm outdated` in root (and `frontend/` if needed). **Current (2025-02-10):** Root has 4 high (axios; tar → @mapbox/node-pre-gyp → bcrypt). `npm audit fix` fixes axios; tar/bcrypt may need `npm audit fix --force` (bcrypt 6.x breaking — test auth after). **Outdated (root):** archiver (6→7), axios (patch), bcrypt (5→6 major), dotenv, express (4→5 major), multer (1→2 major), pdfkit, redis, uuid. Prefer patch/minor upgrades without breaking changes unless planned. See `docs/SECURITY.md` for practices and backlog.
