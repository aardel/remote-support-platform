# Debug Skill

## Debugging Workflow

When invoked with `/debug`, follow this structured approach:

1. **Reproduce**: First reproduce the issue and confirm the exact error. Read logs, screenshots, or error output provided by the user.
2. **Hypothesize**: Form a hypothesis about the root cause — state it explicitly to the user before touching code.
3. **Verify**: Add targeted logging/diagnostics to VERIFY the hypothesis before changing code. Ask the user to test and share results.
4. **Fix**: Only after confirming root cause, apply a single targeted fix.
5. **Test**: Test the fix and confirm resolution before moving on.
6. **Iterate**: If the fix doesn't work, go back to step 2 with a new hypothesis — do NOT stack patches on top of failed fixes.

## Rules

- Never apply speculative fixes without confirming root cause first
- Never apply more than one fix at a time — isolate changes
- Always check the full data flow (e.g. client → nginx → Express → VNC bridge → WebSocket)
- Consider environment-specific issues: Docker networking, nginx proxy, TLS versions, Windows XP limitations
- Read logs carefully — look for IP mismatches, missing event handlers, wrong ports
