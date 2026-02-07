# Security and audit

## npm audit

Run `npm audit` in the repo root (and in `frontend/` and `helper/` if you add scripts there). Address **high** and **critical** before release.

**Last run:** 2025-02-06 — 3 high severity in dependency chain (tar → @mapbox/node-pre-gyp → bcrypt). Fix may require:

```bash
npm audit fix
# or, if fixes require major upgrades:
npm audit fix --force
```

After `npm audit fix --force`, re-test authentication (login/logout) because bcrypt major upgrades can change hash compatibility. If you rely on existing stored password hashes, migrate or keep bcrypt version and accept the transitive risk until a non-breaking fix is available.

## Practices

- **Secrets**: Use `.env` and env vars; never commit real secrets. `.env` is in `.gitignore`.
- **Auth**: Protected routes use `requireAuth`; session secret must be set in production.
- **File upload**: Multer limits and session-scoped storage; helper file ops restricted to user homedir.
- **Socket.io**: Events scoped by session room; no sensitive data in client-visible payloads beyond what’s needed.

For security-sensitive changes, run the **security-audit** agent (or review auth, file, and socket handling) before release.
