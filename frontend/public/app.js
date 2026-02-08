// Get session ID from URL or generate
function getSessionIdFromURL() {
    const path = window.location.pathname;
    const match = path.match(/\/(support|connect)\/([A-Z0-9-]+)/);
    return match ? match[2] : null;
}

function generateSessionId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 3; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    id += '-';
    for (let i = 0; i < 3; i++) {
        id += Math.floor(Math.random() * 10);
    }
    id += '-';
    for (let i = 0; i < 3; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

// Initialize
const sessionId = getSessionIdFromURL();
document.getElementById('sessionId').textContent = sessionId || 'Missing';
if (!sessionId) {
    const status = document.getElementById('status');
    const btn = document.getElementById('connectBtn');
    status.className = 'status error';
    status.textContent = '❌ Missing session ID in URL';
    btn.disabled = true;
    btn.textContent = 'Invalid link';
}

// Copy session ID
function copySessionId() {
    const id = document.getElementById('sessionId').textContent;
    navigator.clipboard.writeText(id).then(() => {
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    });
}

// Connect to server
async function connectToServer() {
    const allowConnection = document.getElementById('allowConnection').checked;
    
    if (!allowConnection) {
        alert('Please check "Allow remote connection" first');
        return;
    }
    
    const btn = document.getElementById('connectBtn');
    const status = document.getElementById('status');
    
    btn.disabled = true;
    btn.textContent = 'Connecting...';
    status.className = 'status waiting';
    status.textContent = '🔄 Connecting to server...';
    
    try {
        const allowUnattended = document.getElementById('allowUnattended').checked;
        
        // Register session
        await registerSession(sessionId, allowUnattended);
        
        // Setup WebSocket for approval requests
        setupConnectionApprovalListener();
        
        status.className = 'status connected';
        status.textContent = '✅ Connected - Ready for support!';
        btn.textContent = 'Connected';
        
    } catch (error) {
        status.className = 'status error';
        status.textContent = '❌ Connection failed: ' + error.message;
        btn.disabled = false;
        btn.textContent = 'Retry Connection';
    }
}

// Register session with server
async function registerSession(sessionId, allowUnattended) {
    const serverUrl = window.location.origin;
    
    const clientInfo = {
        os: navigator.platform,
        hostname: window.location.hostname,
        userAgent: navigator.userAgent
    };
    
    const response = await fetch(`${serverUrl}/api/sessions/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sessionId,
            clientInfo,
            allowUnattended,
            vncPort: 5900,
            status: 'connected'
        })
    });
    
    if (!response.ok) {
        throw new Error('Failed to register session');
    }
    
    return await response.json();
}

// Setup WebSocket for approval requests
let approvalSocket = null;

function setupConnectionApprovalListener() {
    if (!sessionId) return;
    if (approvalSocket) {
        try { approvalSocket.disconnect(); } catch (_) {}
        approvalSocket = null;
    }

    // Uses Socket.IO (served from /socket.io/socket.io.js).
    approvalSocket = io(window.location.origin, { transports: ['websocket', 'polling'] });
    approvalSocket.on('connect', () => {
        // Join only to receive approval requests; do not mark this as a helper connection.
        approvalSocket.emit('join-session', { sessionId, role: 'customer' });
    });
    approvalSocket.on('connection-request', (data) => {
        const allowUnattended = document.getElementById('allowUnattended').checked;
        if (allowUnattended) {
            approveConnectionAutomatically(data);
        } else {
            showApprovalModal(data);
        }
    });
}

// Show approval modal
let pendingConnection = null;

function showApprovalModal(connectionData) {
    pendingConnection = connectionData;
    
    document.getElementById('techName').textContent = connectionData.technicianName || 'Unknown';
    document.getElementById('approvalSessionId').textContent = sessionId;
    document.getElementById('approvalTime').textContent = new Date().toLocaleTimeString();
    
    const modal = document.getElementById('approvalModal');
    modal.classList.add('show');
}

// Approve connection
async function allowConnection() {
    if (!pendingConnection) return;
    
    const modal = document.getElementById('approvalModal');
    modal.classList.remove('show');
    
    // Send approval to server
    const serverUrl = window.location.origin;
    await fetch(`${serverUrl}/api/sessions/${sessionId}/approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: true })
    });
    
    document.getElementById('status').className = 'status connected';
    document.getElementById('status').textContent = '✅ Connection approved - Technician connected';
    
    pendingConnection = null;
}

// Deny connection
async function denyConnection() {
    if (!pendingConnection) return;
    
    const modal = document.getElementById('approvalModal');
    modal.classList.remove('show');
    
    // Send denial to server
    const serverUrl = window.location.origin;
    await fetch(`${serverUrl}/api/sessions/${sessionId}/approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: false })
    });
    
    document.getElementById('status').className = 'status waiting';
    document.getElementById('status').textContent = '❌ Connection denied';
    
    pendingConnection = null;
}

// Auto-approve if unattended is enabled
function approveConnectionAutomatically(connectionData) {
    const serverUrl = window.location.origin;
    fetch(`${serverUrl}/api/sessions/${sessionId}/approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: true })
    });
    
    document.getElementById('status').className = 'status connected';
    document.getElementById('status').textContent = '✅ Connected - Technician can access';
}

// Auto-connect when checkbox is checked
document.getElementById('allowConnection').addEventListener('change', (e) => {
    if (e.target.checked) {
        setupConnectionApprovalListener();
        setTimeout(() => {
            connectToServer();
        }, 2000);
    } else {
        if (approvalSocket) {
            try { approvalSocket.disconnect(); } catch (_) {}
            approvalSocket = null;
        }
        document.getElementById('status').className = 'status waiting';
        document.getElementById('status').textContent = '⚪ Disconnected';
        document.getElementById('connectBtn').disabled = false;
        document.getElementById('connectBtn').textContent = 'Connect to Server';
    }
});

// Handle unattended checkbox change
document.getElementById('allowUnattended').addEventListener('change', (e) => {
    const status = document.getElementById('status');
    if (e.target.checked) {
        status.textContent = '⚪ Waiting (unattended mode - auto-approve)';
    } else {
        status.textContent = '⚪ Waiting (manual approval required)';
    }
});
