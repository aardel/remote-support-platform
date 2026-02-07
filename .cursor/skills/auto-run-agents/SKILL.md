---
name: auto-run-agents
description: Ensures project subagents in .cursor/agents/ are invoked automatically when the context matches. Use when the user changes code, pushes, releases, updates docs, or when handover or maintenance is discussed.
---

# Auto-run project subagents

Project subagents live in `.cursor/agents/`. **Invoke the relevant subagent automatically** whenever the current request or recent context matches a trigger below. Do not wait for the user to name the agent.

## Approval workflow (human accepts/declines todo list)

When the user says **"put agents to work"**, **"run the workflow"**, **"run all agents"**, **"give me the todo from agents"**, or **"agents suggest, I approve"**: use the **agent-approval-workflow** skill. Do not execute agent suggestions directly. Instead:

1. Run agents in **suggestion mode** (gather what each would do; do not create/edit files).
2. Present a single **numbered approval todo list** (table: #, Action, Source, What will be done).
3. Ask the user to reply with **Accept all** | **Accept 1, 3, 5** | **Decline 2, 4** (or similar).
4. After the user replies, **execute only the accepted items**.

The human's only job is to accept or decline the list; the agent then acts accordingly.

## Trigger → Agent mapping (single-agent runs)

| Trigger | Invoke |
|--------|--------|
| User just changed code, added a feature, or says "review" / "check my code" | **code-reviewer** |
| User pushes to main, says "release" / "ship" / "ready for release" / "tag" / "bump version" | **version-steward**, **changelog**, then **github-docs-sync**; before first release in a while, **security-audit** |
| User added or changed an API route or Socket.io event | **api-contracts** |
| User added or changed deployment, CI, PM2, or "how we deploy" | **devops-release** |
| User added a dependency or upgraded packages / Node | **dependencies** |
| User asks for tests, coverage, or "does this have tests?" | **testing** |
| User asks for handover, "clean up docs", "another dev taking over", or "remove obsolete" | **docs-steward** |
| User asks to update README, repo description, or "what does this project do" for GitHub | **github-docs-sync** |
| User says "bump version", "set version to X", "version in sync?", or "version steward" | **version-steward** |
| User onboarding, "how to contribute", or project structure changed | **contributing** |
| User mentions security, "before we ship", or changed auth/file/upload code | **security-audit** |
| User asks for "future features", "futurefeatures", "roadmap", "ideas", "what to build next", or planning | **future-features** |
| User asks for "ui steward", "uisteward", UI improvements, dashboard changes, "find users easily", "scale to many users", or minimalistic UX | **ui-steward** |
| User says "build frontend", "restart backend", "rebuild and restart", or after frontend/backend changes that need build or restart | **build-restart** (execute directly) |

## How to invoke

Delegate in the same turn when the trigger applies. Example:

- After implementing a new feature: *"I'll run the code-reviewer subagent to review the changes."* Then invoke **code-reviewer**.
- Before release: *"I'll run the changelog and github-docs-sync subagents to update release notes and repo description."* Then invoke **changelog** and **github-docs-sync**.

One trigger can map to multiple agents (e.g. release → changelog + github-docs-sync + security-audit). Run all that apply; order by dependency (e.g. changelog before github-docs-sync).

## Rules

- **Automatic**: If the user's intent or recent work matches a trigger, invoke the subagent without asking "should I run X?"
- **Single turn**: Prefer invoking in the same response where you complete the main task (e.g. "Feature is done. Running code-reviewer to review the change.").
- **No duplicate runs**: If the user explicitly asked for an agent (e.g. "run docs-steward"), run it once; do not run it again in the same conversation unless context changed.
- **List location**: Agent definitions are in `.cursor/agents/*.md`; use each agent's `name` when delegating (e.g. "Use the code-reviewer subagent...").
- **Full workflow**: For "put agents to work" / "run the workflow", use the approval workflow (agent-approval-workflow skill): present todo list → user accept/decline → execute only accepted.
- **build-restart: execute directly**: When the trigger for build-restart applies (user asked to build/restart, or you just changed frontend/backend code), run the build and/or restart commands yourself in the same turn. Do not only suggest or tell the user to run them. Run `npm run build` and/or `pm2 restart remote-support-backend` (or report if PM2 is not in use). Exception: inside the approval workflow use suggestion mode only (add "Build frontend and restart backend" as a todo item for the user to accept).
