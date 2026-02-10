# UI guidelines

Principles and backlog for the technician dashboard and session view. Goal: **minimalistic**, **functional**, and **not confusing**—especially with many users/sessions (e.g. 50–100+).

## Principles

- **Minimalistic**: No unnecessary UI; one clear way to do a task.
- **Functional**: Every control has a clear purpose; primary actions (Connect, Generate package) are obvious.
- **Scale-friendly**: When many sessions or devices exist, technicians can find and connect to the right user in under 10 seconds.
- **Sections**: Group by purpose (e.g. Active now vs Waiting vs Devices) so the page is scannable.
- **Accessibility**: Focus order, labels, contrast; don’t rely only on color for status.

## Current layout (summary)

- **Dashboard**: Two modes — **Widget dashboard** (default landing): customizable widget grid (Generate package, Active sessions, Registered devices, Helper templates, Stats, etc.) with drag-and-drop; **Classic dashboard**: single scroll with search, Devices, Generate/Templates, Active Sessions. Layout shell: header with “Generate Support Package”, hamburger sidebar (Dashboard, Sessions, Devices, Statistics, Helper Templates, Classic, Preferences). Search filters by session ID, hostname, device name; status filter and sort still in backlog.
- **SessionView**: **Responsive header** — Row 1: session ID, status + connection timer, version, control badge (robotjs on/off), Files and Disconnect buttons. Row 2 (when connected): Monitor, Stream, Split view, Fullscreen. Breakpoints at 768px and 480px: tighter spacing, smaller type, “Files” label hidden on very small screens; session title truncates with ellipsis. Video area (single or split) and file-transfer modal (two-panel, remote file browser). In **VNC mode** (no WebRTC), SessionView shows a noVNC iframe and uses the Bridge API for chat and file list/download. The **Monitor** dropdown only enables displays that exist on the customer’s machine (helper sends `displayCount` in capabilities); options beyond that show “(not available)” and are disabled.

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

- Dashboard: `frontend/src/pages/WidgetDashboard.jsx`, `ClassicDashboard.jsx`, `DevicesPage.jsx`, `SessionsPage.jsx`, `StatisticsPage.jsx`, `HelperTemplatesPage.jsx`; layout: `frontend/src/components/Layout.jsx`.
- Session view: `frontend/src/pages/SessionView.jsx`, `SessionView.css` (responsive header: `.session-header`, `.session-header-main`, `.session-settings`; media queries at 768px, 480px).

Last updated: 2025-02-10 (SessionView VNC mode, chat modal, Bridge file panel; widget linkTo; sessions above devices, search by customer/machine)
