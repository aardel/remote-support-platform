# Automating agents and CI

## The `.cursor` folder

The `.cursor` directory **is committed to the repo** (not in `.gitignore`). That way agents and skills are versioned and shared.

| Path | Purpose |
|------|--------|
| `.cursor/agents/*.md` | Agent definitions (code-reviewer, build-restart, changelog, docs-steward, etc.). See `.cursor/agents/README.md` for the list. |
| `.cursor/skills/auto-run-agents/SKILL.md` | When to invoke which agent (trigger → agent mapping). |
| `.cursor/skills/agent-approval-workflow/SKILL.md` | “Put agents to work” flow: todo list → accept/decline → run only accepted. |

CLAUDE.md tells the AI to read these and invoke agents when your message or context matches. Keeping `.cursor/` in the repo ensures everyone (and every Cursor session) uses the same automation rules.

## What is fully automated (no chat needed)

| What | How |
|------|-----|
| **Build + test on every push** | GitHub Action `.github/workflows/ci.yml` runs on push/PR to `main`: install deps, `npm run build`, `npm test`. No Cursor or AI involved. |
| **Helper builds (EXE/DMG)** | `.github/workflows/build-helper.yml` runs on push to `main`; produces artifacts. Optional deploy when `DEPLOY_SSH_KEY` etc. are set. |

So: every push to `main` gets a frontend build and smoke test in CI. Helper builds are already automated.

## What is “automated” only when you’re in Cursor chat

The **project agents** (code-reviewer, build-restart, docs-steward, changelog, etc.) are instructions for the AI. They only run when:

1. You’re in a Cursor chat, and  
2. Your message or recent context matches a trigger in `.cursor/skills/auto-run-agents/SKILL.md`.

To make the AI **always** run them when context matches, the project uses:

- **CLAUDE.md** — “Agents (auto-invoke)” section: you **must** invoke the relevant agent(s) when a trigger matches; don’t wait for the user to name the agent.

So in practice: when you say things like “I pushed”, “build and restart”, “review my code”, “put agents to work”, or the AI sees recent code changes, it will (by project rule) run the right agent(s) in the same turn. That’s as “fully automated” as the AI agents can get — they can’t run without a Cursor conversation.

## Optional: deploy/restart on push

To have the **server** restart (e.g. `pm2 restart remote-support-backend`) automatically on push, you’d add a deploy step to a workflow (e.g. in `ci.yml` or a separate `deploy.yml`) that SSHs to the server and runs the restart. That requires GitHub secrets (`SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY`). See `docs/DEPLOYMENT.md` for the pattern. Not added by default so each environment can choose.

## Summary

- **Fully automated without Cursor:** CI build + test on push; helper builds on push.  
- **Automated when you chat:** Agents run automatically when your message/context matches; CLAUDE.md enforces that the AI invokes them.  
- **Not automated:** AI agents do not run on a bare “git push” with no Cursor chat; there is no Cursor API to trigger them from GitHub.
