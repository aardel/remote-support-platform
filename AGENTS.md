# Repository Guidelines

## Project Structure & Module Organization
This repository is a Node/JavaScript monorepo for a remote support platform.

- `backend/`: Express API, Socket.io signaling, routes in `backend/routes/`, core logic in `backend/services/`, models in `backend/models/`.
- `frontend/`: React + Vite technician dashboard (`frontend/src`) and static customer/support pages (`frontend/public`).
- `helper/`: Electron customer helper app (`helper/src`) used for screen capture, control, and session connectivity.
- `tests/`: smoke and manual test notes (`tests/smoke.js`, `tests/README.md`).
- `docs/`: architecture, deployment, security, and API/event references.
- `packages/`, `uploads/`: generated installer/session artifacts and uploaded files.

## Build, Test, and Development Commands
- `npm run dev` (repo root): starts backend in dev mode (`nodemon backend/server.js`).
- `npm run build` (repo root): installs frontend deps and builds `frontend/dist`.
- `npm test` (repo root): runs smoke checks (health endpoint + `tests/smoke.js`).
- `npm run migrate`: runs database migrations (`backend/scripts/migrate.js`).
- `npm run version:sync`: syncs version across app packages.
- `cd frontend && npm run dev`: run Vite frontend locally.
- `cd helper && npm run dev`: run Electron helper locally.

## Coding Style & Naming Conventions
- Use modern JavaScript with `async/await`, `const`/`let`, and semicolons.
- Use `camelCase` for variables/functions, `PascalCase` for React components, and clear route names (for example `backend/routes/sessions.js`).
- Keep backend responsibilities separated: route handlers in `backend/routes/`, reusable logic in `backend/services/`.
- Match local file style: frontend commonly uses 2-space indentation; backend files often use 4 spaces.

## Testing Guidelines
- Primary automated check is `npm test` (smoke).
- Add focused tests for critical paths (auth, sessions, file transfer, bridge/VNC behavior) when changing those areas.
- Keep test files descriptive (for example `tests/smoke.js`) and document manual verification steps in `tests/README.md` when needed.

## Commit & Pull Request Guidelines
- Follow concise, imperative commit messages seen in history: `Fix ...`, `Add ...`, `Update ...`, `Bump ...`.
- Keep commits scoped to one change theme.
- Open PRs against `main` with:
  - clear summary of what changed and why,
  - linked issue/ticket when applicable,
  - testing notes (commands run, manual checks),
  - UI screenshots for frontend/session view changes.

## Security & Configuration Tips
- Copy `.env.example` to `.env` for local setup; never commit secrets.
- Review `docs/SECURITY.md` and `docs/DEPLOYMENT.md` before production changes.
