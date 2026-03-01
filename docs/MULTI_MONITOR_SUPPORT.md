# Multi-Monitor Support: Horizontal, Vertical, and Dual Monitors

## Challenge

Users have different monitor configurations:
- **Single monitor** (horizontal/landscape)
- **Single monitor** (vertical/portrait)
- **Dual monitors** (both horizontal)
- **Dual monitors** (mixed: horizontal + vertical)
- **Multiple monitors** (3+)

We need to handle all these scenarios seamlessly.

---

## Solutions Overview

### Option 1: Monitor Selection (Recommended) ⭐⭐⭐⭐⭐
- User selects which monitor to share
- Technician can switch between monitors
- Best user experience

### Option 2: Combined View
- Show all monitors as one large display
- Simpler but less ideal

### Option 3: Auto-Detect Primary
- Automatically share primary monitor
- Simple but limited

---

## Solution 1: Monitor Selection UI (Recommended)

### User Side: Monitor Selection Screen

```
┌─────────────────────────────────────────┐
│  Select Monitor to Share                │
├─────────────────────────────────────────┤
│                                         │
│  Which monitor do you want to share?    │
│                                         │
│  ┌──────────┐  ┌──────────┐           │
│  │ Monitor 1 │  │ Monitor 2 │           │
│  │          │  │          │           │
│  │ 1920x1080│  │ 1080x1920 │           │
│  │ Landscape│  │ Portrait  │           │
│  │          │  │          │           │
│  │ [Select] │  │ [Select] │           │
│  └──────────┘  └──────────┘           │
│                                         │
│  ☑️ Allow switching monitors            │
│                                         │
│  [Start Sharing]                       │
│                                         │
└─────────────────────────────────────────┘
```

### Implementation: Monitor Detection

```javascript
// Detect available monitors
async function detectMonitors() {
    // Method 1: Using Screen API (if available)
    if (window.screen && screen.multiMonitor) {
        return screen.multiMonitor.getDisplays();
    }
    
    // Method 2: Try getDisplayMedia for each monitor
    const monitors = [];
    
    // Request user to select monitor
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                displaySurface: 'monitor',
                // Browser will show monitor selection dialog
            }
        });
        
        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings();
        
        monitors.push({
            id: settings.deviceId || 'monitor-1',
            label: settings.displaySurface || 'Monitor 1',
            width: settings.width,
            height: settings.height,
            primary: settings.isPrimary || false
        });
    } catch (error) {
        console.error('Error detecting monitors:', error);
    }
    
    return monitors;
}
```

### Enhanced: Monitor Selection with Preview

```html
<!DOCTYPE html>
<html>
<head>
    <title>Select Monitor</title>
    <style>
        .monitor-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            padding: 20px;
        }
        
        .monitor-card {
            border: 3px solid #ddd;
            border-radius: 8px;
            padding: 15px;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s;
        }
        
        .monitor-card:hover {
            border-color: #667eea;
            transform: scale(1.05);
        }
        
        .monitor-card.selected {
            border-color: #667eea;
            background: #f0f4ff;
        }
        
        .monitor-preview {
            width: 100%;
            height: 150px;
            background: #f5f5f5;
            border-radius: 4px;
            margin: 10px 0;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            color: #666;
        }
        
        .monitor-info {
            font-size: 14px;
            color: #333;
            margin: 5px 0;
        }
        
        .monitor-resolution {
            font-weight: bold;
            color: #667eea;
        }
        
        .monitor-orientation {
            font-size: 12px;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Select Monitor to Share</h1>
        
        <div class="monitor-grid" id="monitorGrid">
            <!-- Monitors will be populated here -->
        </div>
        
        <div style="margin-top: 20px; text-align: center;">
            <label>
                <input type="checkbox" id="allowSwitching" checked>
                Allow technician to switch monitors
            </label>
        </div>
        
        <button onclick="startSharing()" style="margin-top: 20px; padding: 15px 30px;">
            Start Sharing Selected Monitor
        </button>
    </div>
    
    <script>
        let selectedMonitor = null;
        let availableMonitors = [];
        
        async function loadMonitors() {
            // Detect monitors
            availableMonitors = await detectMonitors();
            
            // Display monitor cards
            const grid = document.getElementById('monitorGrid');
            grid.innerHTML = '';
            
            availableMonitors.forEach((monitor, index) => {
                const card = document.createElement('div');
                card.className = 'monitor-card';
                card.onclick = () => selectMonitor(index);
                
                const orientation = monitor.width > monitor.height ? 'Landscape' : 'Portrait';
                const icon = monitor.width > monitor.height ? '🖥️' : '📱';
                
                card.innerHTML = `
                    <div class="monitor-preview">
                        ${icon} Monitor ${index + 1}
                    </div>
                    <div class="monitor-info">
                        <div class="monitor-resolution">${monitor.width} × ${monitor.height}</div>
                        <div class="monitor-orientation">${orientation}</div>
                        ${monitor.primary ? '<div style="color: green;">Primary Monitor</div>' : ''}
                    </div>
                `;
                
                grid.appendChild(card);
            });
        }
        
        function selectMonitor(index) {
            selectedMonitor = availableMonitors[index];
            
            // Update UI
            document.querySelectorAll('.monitor-card').forEach((card, i) => {
                if (i === index) {
                    card.classList.add('selected');
                } else {
                    card.classList.remove('selected');
                }
            });
        }
        
        async function startSharing() {
            if (!selectedMonitor) {
                alert('Please select a monitor');
                return;
            }
            
            const allowSwitching = document.getElementById('allowSwitching').checked;
            
            // Start sharing selected monitor
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    displaySurface: 'monitor',
                    // Browser will show selection dialog
                    // User selects the monitor they want
                }
            });
            
            // Register with server
            await registerMonitorSelection({
                monitorId: selectedMonitor.id,
                allowSwitching: allowSwitching,
                availableMonitors: availableMonitors
            });
            
            // Continue with connection...
        }
        
        // Load monitors on page load
        loadMonitors();
    </script>
</body>
</html>
```

---

## Solution 2: Technician Side - Monitor Switching

### Technician Dashboard: Monitor Switcher

```
┌─────────────────────────────────────────┐
│  Remote Desktop View                    │
├─────────────────────────────────────────┤
│  [Monitor 1] [Monitor 2] [All Monitors] │
│                                         │
│  ┌─────────────────────────────────┐  │
│  │                                 │  │
│  │     Remote Desktop View         │  │
│  │                                 │  │
│  │                                 │  │
│  └─────────────────────────────────┘  │
│                                         │
│  Monitor: 1 of 2  |  Resolution: 1920x1080 │
└─────────────────────────────────────────┘
```

### Implementation: Monitor Switching

```javascript
// Technician side: Monitor switcher component
class MonitorSwitcher {
    constructor(sessionId, websocket) {
        this.sessionId = sessionId;
        this.ws = websocket;
        this.currentMonitor = 0;
        this.availableMonitors = [];
    }
    
    async switchMonitor(monitorIndex) {
        // Request monitor switch from server
        this.ws.send(JSON.stringify({
            type: 'switch-monitor',
            sessionId: this.sessionId,
            monitorIndex: monitorIndex
        }));
        
        // Server will request new stream from user
        // User's browser will capture new monitor
        // Stream updates automatically
    }
    
    renderSwitcher() {
        return `
            <div class="monitor-switcher">
                ${this.availableMonitors.map((monitor, index) => `
                    <button 
                        class="monitor-btn ${index === this.currentMonitor ? 'active' : ''}"
                        onclick="switchToMonitor(${index})">
                        Monitor ${index + 1}
                        <span class="monitor-info">${monitor.width}×${monitor.height}</span>
                    </button>
                `).join('')}
                
                ${this.availableMonitors.length > 1 ? `
                    <button onclick="showAllMonitors()" class="monitor-btn">
                        All Monitors
                    </button>
                ` : ''}
            </div>
        `;
    }
}
```

---

## Solution 3: Server-Side Monitor Management

### Monitor Detection API

```javascript
// routes/monitors.js
const express = require('express');
const router = express.Router();

// Get available monitors for session
router.get('/api/sessions/:sessionId/monitors', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await getSession(sessionId);
        
        // Get monitor info from client
        const monitors = await getClientMonitors(sessionId);
        
        res.json({
            monitors: monitors,
            currentMonitor: session.currentMonitor || 0,
            allowSwitching: session.allowSwitching || false
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Switch monitor
router.post('/api/sessions/:sessionId/monitors/switch', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { monitorIndex } = req.body;
        
        // Check if switching is allowed
        const session = await getSession(sessionId);
        if (!session.allowSwitching) {
            return res.status(403).json({ 
                error: 'Monitor switching not allowed for this session' 
            });
        }
        
        // Request monitor switch from client
        await requestMonitorSwitch(sessionId, monitorIndex);
        
        res.json({ success: true, monitorIndex });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

### WebSocket Handler for Monitor Switching

```javascript
// Handle monitor switch request
io.on('connection', (socket) => {
    socket.on('switch-monitor', async (data) => {
        const { sessionId, monitorIndex } = data;
        
        // Send switch request to user's client
        const userSocket = getUserSocket(sessionId);
        if (userSocket) {
            userSocket.emit('request-monitor-switch', {
                monitorIndex: monitorIndex
            });
        }
    });
    
    // User's client responds with new stream
    socket.on('monitor-switched', async (data) => {
        const { sessionId, monitorIndex, streamId } = data;
        
        // Notify technician
        const techSocket = getTechnicianSocket(sessionId);
        if (techSocket) {
            techSocket.emit('monitor-updated', {
                monitorIndex: monitorIndex,
                streamId: streamId
            });
        }
    });
});
```

---

## Solution 4: VNC Multi-Monitor Support

### TightVNC Multi-Monitor Configuration

**Option A: Span All Monitors (Single Large Display)**
```ini
# TightVNC Configuration
[admin]
UseAllMonitors=1
```

**Option B: Select Specific Monitor**
```cmd
# Start VNC server for specific monitor
tvnserver.exe -display :0.0  # Monitor 1
tvnserver.exe -display :0.1  # Monitor 2
```

### Monitor Selection for VNC

```javascript
// VNC Manager: Handle monitor selection
class VNCManager {
    async startWithMonitor(monitorIndex) {
        // Configure VNC for specific monitor
        const config = `
[admin]
UseAllMonitors=0
DisplayNumber=${monitorIndex}
`;
        
        fs.writeFileSync(this.configPath, config);
        
        // Start VNC server
        await this.start();
    }
    
    async switchMonitor(monitorIndex) {
        // Stop current VNC
        await this.stop();
        
        // Start with new monitor
        await this.startWithMonitor(monitorIndex);
    }
}
```

---

## Solution 5: Combined Monitor View (Fallback)

### Show All Monitors as One Display

```javascript
// Combine all monitors into single view
function combineMonitors(monitors) {
    // Calculate total width/height
    const totalWidth = monitors.reduce((sum, m) => sum + m.width, 0);
    const maxHeight = Math.max(...monitors.map(m => m.height));
    
    return {
        width: totalWidth,
        height: maxHeight,
        monitors: monitors
    };
}

// Display combined view
function renderCombinedView(combined) {
    return `
        <div class="combined-monitors" style="width: ${combined.width}px; height: ${combined.height}px">
            ${combined.monitors.map((monitor, index) => `
                <div class="monitor-view" 
                     style="width: ${monitor.width}px; height: ${monitor.height}px">
                    Monitor ${index + 1}
                </div>
            `).join('')}
        </div>
    `;
}
```

---

## User Experience Flow

### Step 1: Monitor Detection
```
User opens support helper
    ↓
App detects available monitors
    ↓
Shows monitor selection screen
```

### Step 2: Monitor Selection
```
User sees:
- Monitor 1: 1920×1080 (Landscape)
- Monitor 2: 1080×1920 (Portrait)
    ↓
User selects Monitor 1
    ↓
Checks "Allow switching monitors"
```

### Step 3: Sharing Starts
```
Selected monitor starts sharing
    ↓
Technician sees Monitor 1
    ↓
If switching allowed: Technician can switch
```

### Step 4: Monitor Switching (If Allowed)
```
Technician clicks "Monitor 2"
    ↓
Server requests switch from user
    ↓
User's browser captures Monitor 2
    ↓
Technician sees Monitor 2
```

---

## Orientation Handling

### Detect Orientation

```javascript
function getMonitorOrientation(monitor) {
    if (monitor.width > monitor.height) {
        return 'landscape';
    } else if (monitor.height > monitor.width) {
        return 'portrait';
    } else {
        return 'square';
    }
}

// Adjust view based on orientation
function adjustViewForOrientation(orientation) {
    const container = document.getElementById('remoteView');
    
    if (orientation === 'portrait') {
        container.style.maxWidth = '100%';
        container.style.height = 'auto';
    } else {
        container.style.width = '100%';
        container.style.maxHeight = '100vh';
    }
}
```

### CSS for Portrait Monitors

```css
.remote-view.portrait {
    max-width: 100%;
    height: auto;
    transform: rotate(0deg);
}

.remote-view.landscape {
    width: 100%;
    max-height: 100vh;
}
```

---

## Database Schema

### Store Monitor Configuration

```sql
CREATE TABLE session_monitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id),
    monitor_index INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    orientation VARCHAR(20), -- 'landscape', 'portrait', 'square'
    is_primary BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_session_monitors_session ON session_monitors(session_id);
```

---

## Recommended Implementation

### Phase 1: Basic Monitor Selection
1. ✅ Detect available monitors
2. ✅ Show selection UI to user
3. ✅ Share selected monitor
4. ✅ Display in technician view

### Phase 2: Monitor Switching
1. ✅ Add "Allow switching" checkbox
2. ✅ Implement monitor switcher in technician UI
3. ✅ Handle monitor switch requests
4. ✅ Update stream when monitor changes

### Phase 3: Advanced Features
1. ✅ Show all monitors in combined view
2. ✅ Monitor thumbnails/previews
3. ✅ Orientation detection and handling
4. ✅ Monitor layout visualization

---

## Best Practices

### For Users
- ✅ Select the monitor with the issue
- ✅ Allow switching if you have multiple monitors
- ✅ Check orientation matches your setup

### For Technicians
- ✅ Ask user which monitor has the issue
- ✅ Switch monitors if needed
- ✅ Adjust view for portrait monitors
- ✅ Use "All Monitors" view for overview

---

## Summary

### ✅ **Multi-Monitor Support Solutions**

**Approach 1: Monitor Selection** (Recommended)
- User selects which monitor to share
- Technician can switch (if allowed)
- Best user experience

**Approach 2: Combined View**
- Show all monitors as one display
- Simpler but less ideal

**Approach 3: Auto-Detect Primary**
- Automatically share primary monitor
- Simple but limited

**Features:**
- ✅ Horizontal monitor support
- ✅ Vertical/portrait monitor support
- ✅ Dual monitor support
- ✅ Monitor switching capability
- ✅ Orientation detection
- ✅ Resolution handling

**Result**: **Full multi-monitor support** for all user configurations! 🖥️📱
