---
name: agent-approval-workflow
description: Runs project subagents to produce a single approval todo list; the human only accepts or declines items, then the agent executes only accepted ones. Use when the user says "put agents to work", "run the workflow", "give me the todo from agents", or "agents suggest, I approve".
---

# Agent approval workflow

When the user wants agents to drive work but **only execute after human approval**, follow this workflow. The human's job is to **accept or decline** a todo list; the agent then acts only on accepted items.

## When to use

- User says "put agents to work", "run the workflow", "run all agents", "give me the todo list", "agents suggest I approve", or similar.
- User wants a single list of proposed actions and will reply with accept/decline.

## Workflow

### Step 1: Gather suggestions (do not execute)

Run each relevant subagent's logic **in suggestion mode**: determine what each would do (create/update file, run command, add section) and record it as a **proposed action**. Do not create or edit files yet.

Relevant agents for a full run: **api-contracts**, **contributing**, **changelog**, **docs-steward**, **github-docs-sync**, **testing**, **security-audit**, **devops-release**, **dependencies**, **future-features**, **ui-steward**, **code-reviewer** (if there are recent changes), **build-restart** (e.g. "Build frontend and restart backend" if frontend or backend changed).

**ui-steward** and **future-features** must always produce at least one concrete action:
- **ui-steward**: e.g. "Review Dashboard/SessionView and update docs/UI_GUIDELINES.md with current suggestions, backlog, and scale-friendly improvements."
- **future-features**: e.g. "Research roadmap ideas (web search if needed) and update docs/ROADMAP.md with prioritized list and last-updated date."

For each agent, output 1–5 concrete actions, e.g.:

- "Create docs/API_AND_EVENTS.md with REST and Socket.io tables"
- "Update README first paragraph and Key Features"
- "Add npm audit note to security backlog"
- "Create CONTRIBUTING.md with run instructions and where to change what"

Combine all actions into one list. Deduplicate (same file or same action = one item).

### Step 2: Present the approval todo list

Output a single **numbered todo list** in this format:

```markdown
## Approval todo list

Review the items below. Reply with one of:
- **Accept all** — I will execute every item.
- **Accept 1, 3, 5** — I will execute only those (comma-separated numbers or ranges like 1-4).
- **Decline 2, 4** — I will skip those and execute the rest.
- Or comment per item (e.g. "Accept 1 and 2, decline 3").

| # | Action | Source | What will be done |
|---|--------|--------|-------------------|
| 1 | Short title | agent-name | One line: file or command |
| 2 | ... | ... | ... |
```

Keep the table concise. "Source" = which agent suggested it (e.g. api-contracts, docs-steward). End with: **"Reply with your choices (e.g. Accept all, or Accept 1 3 5, or Decline 2 4)."**

Do **not** execute any action yet. Wait for the user's reply.

### Step 3: Parse the user's reply

- **Accept all** → accepted = all numbers.
- **Accept 1, 3, 5** or **Accept 1 3 5** → accepted = {1, 3, 5}.
- **Decline 2, 4** → accepted = all except 2 and 4.
- **Ranges**: "Accept 1-4" → accepted = {1, 2, 3, 4}.
- Mixed: "Accept 1, 3, decline 2" → accepted = {1, 3}.
- If the reply is ambiguous, ask once: "Confirm: execute items 1, 3, 5 only?"

### Step 4: Execute only accepted items

For each accepted item, perform the action (create or update the file, run the command, add the section). Then report briefly: "Done: 1, 3, 5. Skipped: 2, 4." and list what was created/updated.

## Rules

- **Never execute in Step 1 or Step 2.** Only execute after the user has replied with accept/decline in Step 3.
- One action = one row. If an agent suggests "update README and add API doc", split into two rows if they are independent.
- If there are no suggestions (e.g. everything already done), say "No new actions from agents. Todo list is empty."
- If the user says "accept all" in the same message as "put agents to work", treat as: first present the list, then if they already said accept all, execute all after presenting (so one round-trip is enough).
