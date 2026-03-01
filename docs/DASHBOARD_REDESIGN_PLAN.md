# Dashboard Redesign Plan — Widget Dashboard, Dedicated Pages, Navigation

**Status:** Plan (discussion approved; implementation not started)  
**Last updated:** 2025-02-07

This document captures the agreed redesign: new header + hamburger navigation, customizable widget dashboard as landing, dedicated pages (Statistics, Registered Devices, Active Sessions, Helper Templates), Classic dashboard kept, and device metadata (customer name, machine name, IP/country/location). Implementation will follow the phases below.

---

## 1. Agreed decisions (from discussion)

| Topic | Decision |
|-------|----------|
| **Statistics** | As much info as possible; filterable (e.g. date range, customer, device). Customer name: initially same as device default; if technician edits it we update and use that going forward. |
| **Widgets** | All widgets that make sense (see Widget list below). Customizable = user can change **layout** and **size** of widgets. Layout saved **per technician** in backend. |
| **Generate Support Package** | In top header bar; opens a **modal** (choose session/device, then generate). |
| **Navigation** | **Hamburger menu** opens a **sidebar** with links: Dashboard (widgets), Classic Dashboard, Statistics, Registered Devices, Active Sessions, Helper Templates. |
| **Customer / machine name** | **Optional.** If set by tech we show them; if not we show whatever we have: IP address, country, location (IP geolocation). |
| **Current dashboard** | Kept as **Classic Dashboard** so existing operation is not broken; accessible from hamburger. |
| **Session history** | **At technician’s discretion:** each tech chooses retention (7 / 30 / 90 days, Forever, or Don’t keep). Stored in preferences; cleanup job deletes ended sessions accordingly. |
| **Geolocation** | **Free source:** Really Free GEO IP (primary); ip-api.com (fallback). Resolve on device register; store country, region, city (or JSON). |
| **Visual style** | **Modern, clean, productive:** card-based widgets, subtle elevation, clear typography, purposeful layout. See section 2. |

---

## 2. Widgets — technician-centric, productive default

**Mindset:** As a technician I want to land on the dashboard and immediately see what needs attention, start a support session, or jump to a waiting customer. The default widget set should prioritize **next action** and **visibility** over everything else.

### Widgets that make sense (all available; default subset below)

| Widget | Purpose | Content | Size options |
|--------|----------|---------|--------------|
| **Generate Package** | Primary action | Button that opens the Generate Support Package modal (same as header) | Small (button only), Medium (button + short hint) |
| **Active Sessions** | At-a-glance + navigation | Count of active sessions; optional top 3–5 list; “View all” link to Active Sessions page | Small (count + link), Medium (count + 3 items + link), Large (count + 5 items + link) |
| **Registered Devices** | At-a-glance + navigation | Count of devices; optional top 3–5 list; “View all” link to Registered Devices page | Small, Medium, Large (same idea) |
| **Helper Templates** | Status + navigation | EXE/DMG installed or missing; “Manage” link to Helper Templates page | Small (status only), Medium (+ versions/size) |
| **Statistics summary** | Snapshot + navigation | Key numbers (e.g. sessions today, total duration); “View full stats” link to Statistics page | Small (1–2 numbers), Medium (4–6 numbers), Large (mini chart or table) |
| **Classic Dashboard** | Shortcut | Single button/link: “Open Classic Dashboard” (current single-page view) | Small |
| **Recent activity** | Recency | Last 5 sessions (session ID, status, time, customer/device name); one-click Connect or “View all” | Medium, Large |
| **Quick connect** | Convenience | Pinned or last-used session(s); one-click Connect (or “Request session” for device) | Small, Medium |

### Default layout (what makes sense for productivity)

- **Row 1 (primary):** **Generate Package** (medium) — so the main action is always visible. **Active Sessions** (medium) — count + top 3 with Connect button each; “View all” link. **Recent activity** (medium) — last 5 sessions with one-click Connect so I can rejoin or see who just connected.
- **Row 2:** **Registered Devices** (medium) — count + top 3 with Request session; “View all”. **Helper Templates** (small) — EXE/DMG status + “Manage”. **Statistics summary** (small) — e.g. “Sessions today” + “Total duration this week” + “View full stats”.
- **Row 3 (optional):** **Quick connect** (small), **Classic Dashboard** (small).

Rationale: Generate and Active Sessions + Recent activity get me into a support session in one or two clicks. Devices and Templates are one click away. Stats are available but not in the way. Classic remains for those who prefer the old layout.

**Customization:**  
- Technician can **show/hide** each widget.  
- Technician can **resize** (Small / Medium / Large per widget type).  
- Technician can **reorder** (drag-and-drop or up/down).  
- Layout persisted **per technician** in backend (e.g. `technician_preferences.dashboard_layout` JSON).

### Visual design — modern, clean, productive

- **Style:** Modern, uncluttered, professional. Card-based widgets with subtle elevation (shadow or border), consistent spacing, clear typography hierarchy. Avoid “dashboard clutter”; every element should feel purposeful.
- **Colors:** Neutral base (e.g. light gray or soft white background); primary action (Generate, Connect) in a clear accent color; status (waiting, connected, pending) with distinct but accessible colors + text/icon so not color-only. Optional: light/dark theme later.
- **Typography:** Readable sans-serif; numbers and session IDs in monospace where it helps scan. Clear labels; tooltips for compact controls.
- **Density:** Default to “comfortable” — enough info to act without crowding. Compact option for power users (e.g. smaller cards, more rows) can be a preference later.
- **Responsive:** Widget grid stacks or reflows on smaller screens; sidebar becomes overlay or collapsible so mobile/tablet still works.

---

## 3. Information architecture and routes

| Route | Purpose | Notes |
|-------|---------|--------|
| `/` or `/dashboard` | **Widget dashboard** (landing after login) | Customizable grid of widgets. |
| `/dashboard/classic` | **Classic dashboard** | Current single-page (Devices + Generate + Templates + Sessions); unchanged behavior. |
| `/statistics` | **Full statistics page** | Filterable; session time, customer name, OS, device, etc. |
| `/devices` | **Registered Devices page** | List devices; add/edit customer name and machine name; IP/country/location when available. |
| `/sessions` | **Active Sessions page** | List active sessions; Connect, Delete; same data as current, dedicated page. |
| `/helper-templates` | **Helper Templates page** | Template status, upload EXE/DMG, manage. |
| `/session/:sessionId` | **Session view** | Unchanged. |

**Header (all authenticated pages):**  
- Logo / app name (link to `/dashboard`).  
- **Generate Support Package** button → opens modal.  
- **Hamburger** → toggles sidebar.  
- User name + Logout.

**Sidebar (hamburger):**  
- Dashboard (widgets)  
- Classic Dashboard  
- Statistics  
- Registered Devices  
- Active Sessions  
- Helper Templates  

---

## 4. Generate Support Package modal

- **Trigger:** Header button “Generate Support Package”.
- **Content:**  
  - Option A: Generate new session (no device) — same as current “Generate” (creates session, returns link).  
  - Option B: Pick existing session → “Copy link” or “Generate package for this session” if needed.  
  - Option C (optional): Pick registered device → “Request session” (same as current device request).  
- **Result:** Same as today (link + copy to clipboard, success message).  
- **Implementation:** New modal component; reuse existing `POST /api/packages/generate` and device-request API.

---

## 5. Data model changes

### 5.1 Devices

- **Add columns (optional, technician-editable):**  
  - `customer_name` (VARCHAR, nullable).  
  - `machine_name` (VARCHAR, nullable).  
  - If we keep `display_name`, we can treat `machine_name` as the tech-facing label and keep `display_name` for auto (hostname) or merge into one “display name” and add only `customer_name`; **recommendation:** add `customer_name` and `machine_name`; keep `display_name` for backward compatibility (e.g. from helper).
- **IP and location:**  
  - Already have `last_ip`.  
  - Add optional `last_country`, `last_region`, `last_city` (or single `last_geo` JSONB) for resolved location. Resolve on device register (and optionally on heartbeat) using a **free geolocation API** (see section 5.4). If lookup fails or is skipped, show IP only.

**API:**  
- `PATCH /api/devices/:deviceId` (auth) — body: `{ customerName, machineName }` to update tech-editable names.  
- `GET /api/devices` — include `customer_name`, `machine_name`, `last_ip`, and if present `last_country`, `last_region`, `last_city` (or `last_geo`).

### 5.2 Sessions (for statistics and history)

- **Current:** `sessions` has `session_id`, `technician_id`, `device_id`, `status`, `created_at`, `updated_at`, `expires_at`, `client_info` (JSONB in migration). We may have `connected_at` in code; confirm and ensure it’s stored.
- **For “session time” and “as much info as possible”:**  
  - Persist `client_info` (OS, hostname, etc.) in DB on register/connect if not already.  
  - Ensure `connected_at` and `ended_at` (or `disconnected_at`) so we can compute duration.  
  - **Session history retention:** At the **technician’s discretion**. Each technician has a preference: **Keep session history for:** 7 days / 30 days / 90 days / Forever / Don’t keep. Stored in `technician_preferences.session_history_retention_days` (e.g. 7, 30, 90, null = forever, or 0 = don’t keep). Background job or on-demand cleanup deletes ended sessions older than the chosen retention. Statistics page only shows data within retention. Default suggestion: 30 days.
- **Customer name in stats:** Store `customer_name` and `machine_name` (or display_name) on the session row at session start/connect so stats are historical and stable even if the tech later edits the device.

### 5.3 Technician preferences (layout + session history)

- **New table:** e.g. `technician_preferences`: `technician_id` (FK or unique), `dashboard_layout` (JSONB), `session_history_retention_days` (INT nullable: 7, 30, 90, null = forever, 0 = don’t keep).  
- **Layout JSON:** List of widgets: `{ id, type, size, order }` and optionally grid position (e.g. row, col).  
- **API:**  
  - `GET /api/auth/me` or `GET /api/preferences` — return `dashboardLayout`, `sessionHistoryRetentionDays` if saved.  
  - `PUT /api/preferences` — body: `{ dashboardLayout?, sessionHistoryRetentionDays? }` (auth).  
- **Cleanup:** Cron or scheduled job (or on login): for each technician with retention less than “forever”, delete ended sessions older than their retention. If “Don’t keep”, delete ended sessions immediately or after 24h.

### 5.4 IP geolocation (free source)

- **Primary:** **Really Free GEO IP** — `https://reallyfreegeoip.org/json/{IP}`  
  - No API key, no signup, no strict rate limit (use responsibly).  
  - Returns: country, region/city, timezone, latitude, longitude (and more).  
  - Use on device register (and optionally when `last_ip` changes) to set `last_country`, `last_region`, `last_city` (or store full JSON in `last_geo` JSONB).  
- **Fallback (optional):** **ip-api.com** — `http://ip-api.com/json/{IP}`  
  - 45 requests/minute per IP; no key.  
  - Returns: country, regionName, city, lat, lon, etc.  
  - Use if Really Free GEO IP is unavailable or rate-limited.  
- **Implementation:** Backend service or route that, given IP, calls the API (with timeout and error handling), then updates device geo fields. Skip for localhost/private IPs. Cache result per IP for a short TTL (e.g. 24h) to avoid repeated lookups for the same IP.

---

## 6. Statistics page (full)

- **Data:** Sessions (active + ended) with device join for customer/machine name; client_info for OS; computed duration (connected_at → ended_at or now).  
- **Filters:** Date range, technician (if multi-tech), customer name, device/machine name, OS, status.  
- **Columns (example):** Session ID, Start time, End time, Duration, Customer name, Machine/device name, OS, Hostname, IP, Status.  
- **Export (optional):** CSV.  
- **API:** `GET /api/statistics/sessions?from=&to=&customer=&deviceId=&...` (auth) returning list of session rows with computed fields.

---

## 7. Registered Devices page

- **List:** All devices for the technician (same as current API); show customer name, machine name, hostname, OS, last IP, country/region/city (if we have it), last seen, status (Pending/Ready).  
- **Actions:** Request session; **Edit** to set customer name and machine name (opens inline form or modal).  
- **Display rule:** If customer name set → show it; else show machine name; else display_name/hostname; always show what we have (IP, country, etc.).

---

## 8. Active Sessions page

- **Content:** Same list as current “Active Sessions” section (session cards with Connect, Delete, link, client_info).  
- **No structural change** to data; just a dedicated page with same search/filter as classic (and optionally status filter, sort).

---

## 9. Helper Templates page

- **Content:** Current “Helper Templates” block: EXE/DMG status, upload, type selector.  
- **No functional change**; just moved to its own route and linked from sidebar and widgets.

---

## 10. Implementation phases (recommended order)

| Phase | Scope | Notes |
|-------|--------|--------|
| **Phase 1 — Data & API** | Device: add `customer_name`, `machine_name`, geo columns (`last_country`, `last_region`, `last_city` or `last_geo`); PATCH device; geolocation on register (see 5.4). Session: ensure `connected_at`/`ended_at` and client_info persisted; keep ended sessions; snapshot customer/machine name at connect. Preferences: table with `dashboard_layout` and `session_history_retention_days`; GET/PUT preferences; cleanup job for retention. | Migrations, Device model, Session model, preferences, new routes. |
| **Phase 2 — Layout & shell** | Shared layout component: header (logo, Generate button, hamburger, user, logout), sidebar (nav links), main content area. Router: add `/dashboard`, `/dashboard/classic`, `/statistics`, `/devices`, `/sessions`, `/helper-templates`. Redirect `/` to `/dashboard`. | No widget logic yet; Classic at `/dashboard/classic` can be current Dashboard component. |
| **Phase 3 — Generate modal** | Header “Generate Support Package” opens modal: generate new session (current flow), copy link; optional device picker for “Request session”. | Reuse existing generate and device-request APIs. |
| **Phase 4 — Dedicated pages** | Implement Devices page (list + edit customer/machine name), Sessions page (current list), Helper Templates page (current block), Statistics page (filterable table + API). | Each page uses shared layout. |
| **Phase 5 — Widget dashboard** | Widget dashboard at `/dashboard`: grid of widgets; widget types from list above; load/save layout per technician (GET/PUT preferences). Resize and reorder (drag or size selector). | Default layout as in section 2. |
| **Phase 6 — Polish** | IP geolocation (Really Free GEO IP + fallback, device register), Statistics export, empty states, accessibility (focus, labels), session-history retention setting in UI. | Optional. |

---

## 11. Decided / open points

- **Geolocation:** **Decided.** Use Really Free GEO IP (reallyfreegeoip.org) as primary; ip-api.com as fallback. See section 5.4.  
- **Session history retention:** **Decided.** Per technician: preference 7 / 30 / 90 days / Forever / Don’t keep; stored in `technician_preferences.session_history_retention_days`; cleanup job respects it.  
- **Widget default set:** **Decided.** Productivity-focused default in section 2 (Generate + Active Sessions + Recent activity first row; Devices, Templates, Stats second; Quick connect + Classic third).  
- **Classic dashboard URL:** Keep `/dashboard/classic` as dedicated path.

---

## 12. References

- Current dashboard: `frontend/src/pages/Dashboard.jsx`
- Routes: `frontend/src/App.jsx`
- Device model: `backend/models/Device.js`
- Session model: `backend/models/Session.js`
- UI principles: `docs/UI_GUIDELINES.md`
