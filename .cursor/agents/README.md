# Project subagents

These subagents help maintain the Remote Support Platform as if run by a larger team. Use them proactively or when handing off work.

| Agent | Use when |
|-------|----------|
| **docs-steward** | Keep all project docs accurate and handover-ready; remove scrapped/obsolete content. |
| **github-docs-sync** | Update README and GitHub repo description after features or architecture changes. |
| **code-reviewer** | Review code after changes; quality, security, consistency (Node/Express, React, Electron, Socket.io). |
| **testing** | Add or run tests; ensure critical paths (auth, sessions, file transfer, WebRTC) are covered. |
| **security-audit** | Audit auth, secrets, validation, file/socket handling, and npm audit before releases. |
| **devops-release** | Keep deployment, PM2, GitHub Actions, and runbooks accurate and runnable. |
| **api-contracts** | Document REST routes and Socket.io events; keep frontend/helper in sync with backend. |
| **dependencies** | Track package.json (root, frontend, helper); suggest upgrades and document breaking changes. |
| **contributing** | Maintain CONTRIBUTING.md and onboarding so new programmers can contribute quickly. |
| **changelog** | Keep CHANGELOG.md or release notes in sync with git history and releases. |
| **version-steward** | Own versioning: bump root version, sync helper and web app, keep VERSIONING.md and CI aligned. Use when releasing, tagging, or mentioning version. |
| **future-features** | Research and suggest future feature ideas; roadmap and what to build next. |
| **ui-steward** | Monitor dashboard and session UI; suggest minimalistic, functional improvements and scale-friendly navigation (e.g. search, filter, sections for 100+ users). |
| **build-restart** | Build frontend and restart backend (PM2 or dev server) when necessary. |

**How to invoke:** e.g. “Use the code-reviewer subagent to review my last change” or “Run docs-steward to clean up docs for handover.”
