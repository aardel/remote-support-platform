# UI guidelines

Principles and backlog for the technician dashboard and session view. Goal: **minimalistic**, **functional**, and **not confusing**—especially with many users/sessions (e.g. 50–100+).

## Principles

- **Minimalistic**: No unnecessary UI; one clear way to do a task.
- **Functional**: Every control has a clear purpose; primary actions (Connect, Generate package) are obvious.
- **Scale-friendly**: When many sessions or devices exist, technicians can find and connect to the right user in under 10 seconds.
- **Sections**: Group by purpose (e.g. Active now vs Waiting vs Devices) so the page is scannable.
- **Accessibility**: Focus order, labels, contrast; don’t rely only on color for status.

## Current layout (summary)

- **Dashboard**: Header (title, user, Logout) → **Search** (single input filtering both Devices and Sessions by session ID, hostname, device name) → Registered Devices (cards) → Generate Package + Helper Templates → Active Sessions (cards) → **Footer** (app version from `/api/version`). Single scroll; search implemented; no status filter or sort yet.
- **SessionView**: Header (session, status, Monitor, Stream quality, Split view, Files, Disconnect) → video area (single or split) → file-transfer modal (two-panel, remote file browser).

### Split view (intended behavior)

- **Horizontal/landscape window**: Remote screen is split down the middle. **Left frame** = upper (top) half of the remote image; **Right frame** = lower (bottom) half. Implemented via two panels (`.split-view-top`, `.split-view-bottom`) with the same video stream; first panel shows `top: 0` (top 50%), second shows `top: -100%` (bottom 50%). Layout: `flex-direction: row`.
- **Vertical/portrait window**: Same two halves stack vertically so each gets full width: **Top frame** = upper half, **Bottom frame** = lower half. Media query `(orientation: portrait), (max-aspect-ratio: 1/1)` switches to `flex-direction: column`.
- Mouse coordinates in split view map correctly: clicks in the top panel send y in [0, 0.5], clicks in the bottom panel send y in [0.5, 1]. Refs: `SessionView.jsx` (handleMouseEvent, split view video styles), `SessionView.css` (`.video-container-split`, `.split-view-half`).

## Recent state (ui-steward review)

- **Done**: Search box above Devices and Sessions; version in dashboard footer; clear sections (Devices, Actions, Templates, Sessions).
- **Next quick wins**: Status filter (Connected / Waiting / All for sessions; Pending / Ready for devices), sort (by status, date, hostname), and clearer labels/tooltips on SessionView controls (Monitor, Stream quality, Split view, Files).
- **Scale**: When lists grow, add sections/tabs (e.g. Active now vs Waiting vs Devices) and optionally a compact table view for 50+ sessions.

## Backlog (prioritized)

### Quick wins

- **Search box**: ✅ Implemented (filter by session ID, hostname, device name; single debounced input).
- **Status filter**: e.g. "Connected" / "Waiting" / "All" for sessions; "Pending" / "Ready" for devices.
- **Sort**: Sessions by status, created date, or hostname; devices by last seen or name.
- **Labels**: Ensure every control has a label or tooltip (Monitor, Stream quality, Split view, Files) for clarity.
- **Empty states**: Short, actionable copy ("Generate a package" / "Ask user to run the helper").

### Larger (scale)

- **Sections / tabs**: e.g. "Active now" (connected) vs "Waiting" (pending) vs "Devices" so long lists are grouped.
- **Compact list or table**: For 50+ sessions, offer a table view (Session ID, Hostname, Status, Created, Actions) with Connect/Delete; keep cards for low count or detail.
- **Keyboard**: Shortcut to focus search; Enter to connect on focused row (optional).
- **Sticky toolbar**: When scrolling sessions, keep "Generate package" or search visible (optional).

### Don’t

- Add duplicate ways to do the same action.
- Rely only on color for status (use text or icon too).
- Add advanced options in the main flow without a "More" or secondary level.

## Reference

- Dashboard: `frontend/src/pages/Dashboard.jsx`, `Dashboard.css`
- Session view: `frontend/src/pages/SessionView.jsx`, `SessionView.css`

Last updated: 2025-02-07 (split-view behavior documented; ui-steward check)
