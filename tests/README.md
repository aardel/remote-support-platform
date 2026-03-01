# Tests

## Smoke test

From repo root:

```bash
npm test
# or
node tests/smoke.js
```

Uses `GET /api/health`; skips (exit 0) if the server is not running. Set `BASE_URL` to override (e.g. `https://your-domain.example/remote`).

## Manual / session checks

When testing the session viewer and helper:

- **Monitor dropdown (displayCount)**: With a single-monitor customer, only “Monitor 1” should be enabled in SessionView and the control panel; “Monitor 2”, “Monitor 3”, “Monitor 4” should show “(not available)” and be disabled. With a dual-monitor customer, “Monitor 1” and “Monitor 2” should be enabled; the rest disabled. The helper sends `displayCount` in capabilities after connect.
