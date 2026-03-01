# New Interface: Fullscreen Viewer + Floating Control Panel

## Implementation status (checked against this project)

| Item | Status |
|------|--------|
| `control-panel.html` | ✅ Present in `frontend/public/` |
| `control-panel.css` | ✅ Present, dark theme (#16213e, #e2e8f0) |
| `control-panel.js` | ✅ Present; BroadcastChannel, Socket.io, chat, files, minimize/expand, window resize, `beforeunload` → exit-fullscreen |
| `SessionView.jsx` | ✅ Fullscreen toggle, control panel `window.open` with `resizable=yes`, BroadcastChannel listener (switch-monitor, set-quality, toggle-split, exit-fullscreen, disconnect, files-list-remote, open-file-picker, files-send, files-receive), state-update and files-remote-list to panel |
| `SessionView.css` | ✅ `.video-container:fullscreen` styles; fullscreen checkbox uses `.split-view-toggle` |
| `chat.html` | ✅ Removed (replaced by control panel) |

Server restart: see **Restarting the server** below. Agents/skills: see **Agents and skills** below.

---

## Overview

Replace the current single-page SessionView with a two-window architecture:

1. **Viewer Window** — The browser tab goes fullscreen showing only the remote screen (no browser chrome, no controls). Mouse/keyboard events pass through to the remote machine.
2. **Control Panel Popup** — A floating `window.open()` popup containing all session controls. Starts minimal (controls only), expands when the technician opens chat or file browser, and can minimize to a tiny expand-only button.

---

## Architecture

### Current State (what exists now)

- `frontend/src/pages/SessionView.jsx` — single React page with header controls + video area
- `frontend/src/pages/SessionView.css` — styling for the above
- `frontend/public/chat.html` — standalone chat popup (Socket.io-based, dark theme)
- Controls live in `.session-header`: monitor selector, stream quality, split view toggle, files button, chat button, disconnect button
- Video uses Fullscreen API only when user manually right-clicks

### Target State

```
┌─────────────────────────────────────┐   ┌──────────────────────┐
│                                     │   │  Control Panel (popup)│
│     FULLSCREEN VIDEO VIEWER         │   │                      │
│     (entire browser tab)            │   │  [Monitor: 1 ▼]      │
│                                     │   │  [Stream: Balanced ▼] │
│     No browser chrome               │   │  [✓] Split view      │
│     No controls visible             │   │  [💬 Chat] [📁 Files]│
│     Crosshair cursor                │   │  [Exit Fullscreen]   │
│     Mouse/keyboard → remote         │   │  [─ Minimize]        │
│                                     │   │  [✕ Disconnect]      │
│                                     │   └──────────────────────┘
└─────────────────────────────────────┘
```

When minimized:
```
┌────────┐
│ [+]    │  ← tiny floating window, just an expand button
└────────┘
```

When chat is opened:
```
┌──────────────────────┐
│  Control Panel       │
│  [Monitor: 1 ▼]      │
│  [Stream: Balanced ▼] │
│  [✓] Split view      │
│  [💬 Chat ▼] [📁]   │
│  ┌──────────────────┐│
│  │ Tech: hi there   ││
│  │ User: hello      ││
│  │                  ││
│  │ [Type message...]││
│  │ [Send]           ││
│  └──────────────────┘│
│  [Exit Fullscreen]   │
│  [─ Minimize]        │
│  [✕ Disconnect]      │
└──────────────────────┘
```

---

## Detailed Implementation

### File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `frontend/src/pages/SessionView.jsx` | MODIFY | Add fullscreen toggle, open control panel popup, strip controls from header |
| `frontend/src/pages/SessionView.css` | MODIFY | Add fullscreen-specific styles, remove header controls in fullscreen mode |
| `frontend/public/control-panel.html` | NEW | Standalone HTML control panel popup (replaces chat.html functionality) |
| `frontend/public/chat.html` | DELETE | Merged into control-panel.html |

---

### 1. `frontend/public/control-panel.html` (NEW FILE)

This is a **standalone HTML page** (no React) that connects its own Socket.io client. It receives the `sessionId` via URL query parameter.

#### 1.1 HTML Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Controls</title>
  <link rel="stylesheet" href="control-panel.css" />
</head>
<body>
  <div id="app">
    <!-- NORMAL VIEW: controls visible -->
    <div id="normalView">
      <div class="cp-header">
        <span class="cp-title">Session Controls</span>
        <span class="cp-session-id" id="sessionLabel"></span>
      </div>

      <div class="cp-controls">
        <!-- Monitor selector -->
        <div class="cp-row">
          <label>Monitor:</label>
          <select id="monitorSelect">
            <option value="0">Monitor 1</option>
            <option value="1">Monitor 2</option>
            <option value="2">Monitor 3</option>
            <option value="3">Monitor 4</option>
          </select>
        </div>

        <!-- Stream quality -->
        <div class="cp-row">
          <label>Stream:</label>
          <select id="qualitySelect">
            <option value="quality">Best quality</option>
            <option value="balanced" selected>Balanced</option>
            <option value="speed">Optimize for speed</option>
          </select>
        </div>

        <!-- Split view toggle -->
        <div class="cp-row">
          <label class="cp-checkbox">
            <input type="checkbox" id="splitViewToggle" />
            <span>Split view</span>
          </label>
        </div>
      </div>

      <!-- Expandable sections: Chat and Files -->
      <div class="cp-sections">
        <button type="button" class="cp-section-btn" id="chatToggleBtn">
          💬 Chat
          <span class="cp-unread-badge" id="chatBadge" style="display:none"></span>
        </button>
        <button type="button" class="cp-section-btn" id="filesToggleBtn">
          📁 Files
        </button>
      </div>

      <!-- Chat section (hidden by default, expands popup when shown) -->
      <div id="chatSection" class="cp-expandable" style="display:none">
        <div class="cp-chat-messages" id="chatMessages">
          <div class="cp-chat-empty" id="chatEmpty">No messages yet.</div>
        </div>
        <div class="cp-chat-input-area">
          <input type="text" id="chatInput" placeholder="Type a message..." />
          <button type="button" id="chatSendBtn">Send</button>
        </div>
      </div>

      <!-- Files section (hidden by default, expands popup when shown) -->
      <div id="filesSection" class="cp-expandable" style="display:none">
        <!-- File transfer UI: simplified version of the current files modal -->
        <!-- Remote file browser table + local file picker + send/receive buttons -->
        <div class="cp-files-toolbar">
          <button type="button" id="filesUpBtn" disabled>↑ Up</button>
          <button type="button" id="filesRefreshBtn">Refresh</button>
          <input type="file" id="filesInput" multiple style="display:none" />
          <button type="button" id="filesAddBtn">Add files</button>
          <button type="button" id="filesSendBtn" disabled>Send →</button>
          <button type="button" id="filesReceiveBtn" disabled>← Receive</button>
        </div>
        <div class="cp-files-path" id="filesPath">Home</div>
        <div class="cp-files-list" id="filesList"></div>
      </div>

      <!-- Bottom actions -->
      <div class="cp-actions">
        <button type="button" class="cp-btn cp-btn-secondary" id="minimizeBtn">─ Minimize</button>
        <button type="button" class="cp-btn cp-btn-exit" id="exitFullscreenBtn">Exit Fullscreen</button>
        <button type="button" class="cp-btn cp-btn-danger" id="disconnectBtn">Disconnect</button>
      </div>
    </div>

    <!-- MINIMIZED VIEW: just an expand button -->
    <div id="minimizedView" style="display:none">
      <button type="button" class="cp-expand-btn" id="expandBtn">+</button>
    </div>
  </div>

  <script src="/socket.io/socket.io.js"></script>
  <script src="control-panel.js"></script>
</body>
</html>
```

#### 1.2 JavaScript Logic (`frontend/public/control-panel.js`)

```
Key concepts:
- Reads sessionId from URL: new URLSearchParams(window.location.search).get('sessionId')
- Connects Socket.io: io(window.location.origin)
- Joins session: socket.emit('join-session', { sessionId, role: 'technician' })
- Communicates with parent (SessionView) via window.opener and BroadcastChannel
```

**BroadcastChannel pattern** for parent-child communication:

```javascript
const channel = new BroadcastChannel('session-control-' + sessionId);

// Send commands to parent (SessionView)
channel.postMessage({ type: 'switch-monitor', index: 2 });
channel.postMessage({ type: 'set-quality', quality: 'speed' });
channel.postMessage({ type: 'toggle-split', enabled: true });
channel.postMessage({ type: 'exit-fullscreen' });
channel.postMessage({ type: 'disconnect' });

// Receive state updates from parent
channel.onmessage = (event) => {
  const { type, data } = event.data;
  if (type === 'state-update') {
    // Update control states (monitor index, quality, split view, connected status)
  }
};
```

**Window resizing on section toggle:**

```javascript
const SIZES = {
  controls: { width: 280, height: 340 },       // controls only
  withChat: { width: 280, height: 580 },        // controls + chat
  withFiles: { width: 420, height: 620 },       // controls + files (wider for table)
  withBoth: { width: 420, height: 750 },        // controls + chat + files
  minimized: { width: 60, height: 40 }          // just expand button
};

function updateWindowSize() {
  const chatOpen = chatSection.style.display !== 'none';
  const filesOpen = filesSection.style.display !== 'none';
  let size;
  if (chatOpen && filesOpen) size = SIZES.withBoth;
  else if (filesOpen) size = SIZES.withFiles;
  else if (chatOpen) size = SIZES.withChat;
  else size = SIZES.controls;
  window.resizeTo(size.width, size.height);
}
```

**Minimize / Expand:**

```javascript
// Minimize
minimizeBtn.addEventListener('click', () => {
  normalView.style.display = 'none';
  minimizedView.style.display = 'flex';
  window.resizeTo(SIZES.minimized.width, SIZES.minimized.height);
});

// Expand
expandBtn.addEventListener('click', () => {
  minimizedView.style.display = 'none';
  normalView.style.display = '';
  updateWindowSize();
});
```

**Prevent independent close** (when in fullscreen mode):

```javascript
window.addEventListener('beforeunload', (e) => {
  // Notify parent to exit fullscreen
  channel.postMessage({ type: 'exit-fullscreen' });
});
```

**Chat — same Socket.io pattern as current chat.html:**

```javascript
// Send
chatSendBtn.addEventListener('click', () => {
  const msg = chatInput.value.trim();
  if (!msg) return;
  const data = { sessionId, message: msg, role: 'technician', timestamp: Date.now() };
  socket.emit('chat-message', data);
  addChatMessage(data);
  chatInput.value = '';
});

// Receive
socket.on('chat-message', (data) => {
  addChatMessage(data);
  if (chatSection.style.display === 'none') {
    // Show unread badge
    chatBadge.textContent = (parseInt(chatBadge.textContent || '0') + 1);
    chatBadge.style.display = '';
  }
});
```

**Monitor and quality — emit via Socket.io directly:**

```javascript
monitorSelect.addEventListener('change', () => {
  const index = parseInt(monitorSelect.value);
  // Notify parent to call the switch-monitor API
  channel.postMessage({ type: 'switch-monitor', index });
});

qualitySelect.addEventListener('change', () => {
  socket.emit('set-stream-quality', { sessionId, quality: qualitySelect.value });
});

splitViewToggle.addEventListener('change', () => {
  channel.postMessage({ type: 'toggle-split', enabled: splitViewToggle.checked });
});
```

**Files — emit via Socket.io directly (same events as current implementation):**

The file browser connects via the same socket and emits `list-remote-dir`, `get-remote-file`, `put-remote-file` events. This is the same pattern currently in SessionView.jsx but reimplemented in plain JS for the standalone popup.

#### 1.3 CSS (`frontend/public/control-panel.css`)

Dark theme, matching SessionView:
- Background: `#16213e`
- Text: `#e2e8f0`
- Inputs: `#0f172a` background, `#475569` border
- Buttons: `#2563eb` primary, `#dc2626` danger
- Compact layout, minimal padding
- Smooth transitions on expand/collapse
- Minimized view: no padding, just a circular/square button

---

### 2. `frontend/src/pages/SessionView.jsx` (MODIFY)

#### 2.1 Add fullscreen state and control panel reference

```javascript
const [isFullscreen, setIsFullscreen] = useState(false);
const controlPanelRef = useRef(null);  // window.open reference
```

#### 2.2 Add fullscreen toggle checkbox in session header

Add a checkbox in the session controls area:

```jsx
<label className="fullscreen-toggle">
  <input
    type="checkbox"
    checked={isFullscreen}
    onChange={handleFullscreenToggle}
  />
  <span>Fullscreen viewer</span>
</label>
```

#### 2.3 Fullscreen toggle handler

```javascript
const handleFullscreenToggle = async (e) => {
  if (e.target.checked) {
    // Enter fullscreen
    try {
      const container = document.querySelector('.video-container');
      await container.requestFullscreen();
      setIsFullscreen(true);
      openControlPanel();
    } catch (err) {
      console.error('Fullscreen failed:', err);
    }
  } else {
    // Exit fullscreen
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
    setIsFullscreen(false);
    closeControlPanel();
  }
};
```

#### 2.4 Listen for fullscreen exit (Escape key)

```javascript
useEffect(() => {
  const handleFullscreenChange = () => {
    if (!document.fullscreenElement) {
      setIsFullscreen(false);
      // Don't close control panel — user might want it
    }
  };
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
}, []);
```

#### 2.5 Open control panel popup

```javascript
const openControlPanel = () => {
  if (controlPanelRef.current && !controlPanelRef.current.closed) {
    controlPanelRef.current.focus();
    return;
  }
  controlPanelRef.current = window.open(
    `/control-panel.html?sessionId=${encodeURIComponent(sessionId)}`,
    `controls-${sessionId}`,
    'width=280,height=340,menubar=no,toolbar=no,location=no,status=no,resizable=yes'
  );
};
```

#### 2.6 BroadcastChannel listener for control panel commands

```javascript
useEffect(() => {
  const channel = new BroadcastChannel('session-control-' + sessionId);

  channel.onmessage = (event) => {
    const { type, ...data } = event.data;
    switch (type) {
      case 'switch-monitor':
        switchMonitor(data.index);
        break;
      case 'set-quality':
        setStreamQuality(data.quality);
        if (socket) socket.emit('set-stream-quality', { sessionId, quality: data.quality });
        break;
      case 'toggle-split':
        setSplitView(data.enabled);
        break;
      case 'exit-fullscreen':
        if (document.fullscreenElement) document.exitFullscreen();
        setIsFullscreen(false);
        break;
      case 'disconnect':
        disconnect();
        break;
    }
  };

  // Send initial state to control panel
  channel.postMessage({
    type: 'state-update',
    data: { monitorIndex, streamQuality, splitView, connected }
  });

  return () => channel.close();
}, [sessionId, socket, monitorIndex, streamQuality, splitView, connected]);
```

#### 2.7 Header controls remain visible when NOT in fullscreen

The existing header controls stay for non-fullscreen use. When fullscreen is active, the header is hidden (it's outside the fullscreen element — the fullscreen element is `.video-container`, so the header naturally disappears).

#### 2.8 Remove old chat popup logic

Remove the `openChatPopup` function and `chatWindowRef`. Chat is now inside control-panel.html. The chat button in the header (for non-fullscreen mode) can still open the control panel popup with chat section expanded.

#### 2.9 Keep unread badge in header

The SessionView still listens for `chat-message` events to maintain `chatUnread` for the header badge. When the technician clicks the chat button in non-fullscreen mode, it opens the control panel with chat expanded.

---

### 3. `frontend/src/pages/SessionView.css` (MODIFY)

#### 3.1 Fullscreen toggle checkbox styling

```css
.fullscreen-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #e2e8f0;
  font-size: 14px;
  cursor: pointer;
  user-select: none;
}

.fullscreen-toggle input {
  cursor: pointer;
}
```

#### 3.2 Fullscreen video container

When the `.video-container` is in fullscreen mode, it already fills the screen. The existing CSS handles this:

```css
.video-container:fullscreen {
  background: #000;
}
.video-container:fullscreen video {
  width: 100%;
  height: 100%;
}
```

No additional changes needed — the Fullscreen API handles the rest.

---

### 4. Delete `frontend/public/chat.html`

This file is no longer needed. Its functionality is absorbed into `control-panel.html`.

---

## Communication Flow

```
┌──────────────────┐     BroadcastChannel      ┌──────────────────┐
│                  │  ◄────────────────────►    │                  │
│   SessionView    │   switch-monitor           │  Control Panel   │
│   (React page)   │   set-quality              │  (popup window)  │
│                  │   toggle-split              │                  │
│   Video element  │   exit-fullscreen           │  Monitor select  │
│   Mouse/keyboard │   disconnect               │  Quality select  │
│   WebRTC peer    │   state-update              │  Split toggle    │
│                  │                            │  Chat section    │
│                  │                            │  Files section   │
│                  │                            │  Minimize/Expand │
└──────────────────┘                            └──────────────────┘
        │                                              │
        │  WebRTC (video stream)                       │  Socket.io
        │  Socket.io (mouse, keyboard,                 │  (chat-message,
        │   ICE, offer/answer)                         │   set-stream-quality,
        │                                              │   list-remote-dir, etc.)
        ▼                                              ▼
┌──────────────────────────────────────────────────────────┐
│                    Backend (Socket.io server)             │
│                    session room routing                   │
└──────────────────────────────────────────────────────────┘
```

---

## Window Size Behavior

| State | Width | Height | Content |
|-------|-------|--------|---------|
| Controls only | 280px | 340px | Monitor, quality, split, chat/files buttons, actions |
| Controls + Chat | 280px | 580px | Above + chat message area + input |
| Controls + Files | 420px | 620px | Above + file browser table (wider) |
| Controls + Both | 420px | 750px | All sections expanded |
| Minimized | 60px | 40px | Single expand button |

The popup uses `window.resizeTo()` to smoothly adjust when sections open/close.

---

## Minimize Behavior

When minimized:
- The popup shrinks to approximately 60x40 pixels
- Shows only a `[+]` button
- No session information visible — just enough to expand
- Does NOT close the Socket.io connection
- Does NOT interfere with the fullscreen video
- The technician can position this tiny window anywhere on their screen
- Clicking `[+]` restores to the previous size with all sections as they were

---

## Edge Cases

1. **User presses Escape in fullscreen** — Browser exits fullscreen. SessionView detects `fullscreenchange` event, sets `isFullscreen = false`. Control panel stays open — technician can re-enter fullscreen from it.

2. **Control panel is closed while in fullscreen** — The `beforeunload` event on the popup sends `exit-fullscreen` via BroadcastChannel. SessionView exits fullscreen mode.

3. **Browser blocks popup** — If the browser blocks `window.open()`, show a message telling the technician to allow popups for this site. The fullscreen checkbox should not activate until the popup successfully opens.

4. **Multiple monitors** — The popup can be dragged to a second monitor while the video fills the primary monitor. This is the ideal setup for technicians.

5. **Non-fullscreen mode** — All controls remain in the SessionView header as they are today. The control panel popup is optional and only opens when fullscreen is enabled or when the technician clicks the chat/controls button.

---

## Implementation Order

1. Create `control-panel.html`, `control-panel.css`, `control-panel.js` — start with controls only (no chat/files)
2. Add BroadcastChannel communication and test monitor/quality/split/disconnect
3. Add chat section to control panel (absorb chat.html functionality)
4. Add files section to control panel (simplified version of current file modal)
5. Add minimize/expand behavior with window resizing
6. Modify SessionView.jsx — add fullscreen toggle, BroadcastChannel listener, remove old chat popup
7. Delete chat.html
8. Test end-to-end: fullscreen → control panel → chat → files → minimize → expand → exit fullscreen

---

## Restarting the server

- **Development**: Backend is usually run with `npm run dev` (nodemon). After backend changes, restart with Ctrl+C then `npm run dev`. After frontend changes, run `npm run build` from repo root so `frontend/dist/` is updated; if the backend serves that, restart the backend.
- **Production (PM2)**: From repo root, `npm run build` then `pm2 restart remote-support-backend`. See `docs/DEPLOYMENT.md` for full deploy steps, env vars, and `deploy.sh`. Key commands:
  - `pm2 status` — list processes
  - `pm2 restart remote-support-backend` — restart backend
  - `pm2 logs remote-support-backend` — view logs

The **build-restart** agent (`.cursor/agents/build-restart.md`) runs build and/or restart when you say "build frontend", "restart backend", or "rebuild and restart", or after frontend/backend changes.

---

## Agents and skills

- **Auto-run agents** (`.cursor/skills/auto-run-agents/SKILL.md`): Invoke the right agent when context matches (e.g. after code changes → **code-reviewer**; "build and restart" → **build-restart**; release → **changelog**, **version-steward**, **github-docs-sync**).
- **Agent approval workflow** (`.cursor/skills/agent-approval-workflow/SKILL.md`): For "put agents to work" / "agents suggest, I approve" — agents produce a single approval todo list; you accept or decline; only accepted items are executed.
- **Relevant agents for this interface**: **build-restart** (build frontend, restart backend after UI changes), **code-reviewer** (review SessionView/control-panel changes), **ui-steward** (dashboard/session UI, `docs/UI_GUIDELINES.md`), **docs-steward** (keep docs in sync).

**Full automation:** See `docs/AGENTS_AUTOMATION.md` — what runs on every push (CI build + test) vs what runs only when you’re in Cursor chat (agents).
