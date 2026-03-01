# File Transfer Support: VNC and WebRTC Solutions

## Overview

File transfer is **essential** for remote support. Here are the solutions that work with your configuration:

---

## Solution Options

### Option 1: WebRTC Data Channel (Recommended for WebRTC) ⭐⭐⭐⭐⭐
- ✅ Works with WebRTC connections
- ✅ Direct P2P transfer (no server storage)
- ✅ Encrypted by default
- ✅ Fast and efficient

### Option 2: HTTP Upload/Download via Server ⭐⭐⭐⭐
- ✅ Works with both VNC and WebRTC
- ✅ Reliable (server stores files temporarily)
- ✅ Works through firewalls
- ⚠️ Requires server storage

### Option 3: VNC File Transfer Protocol ⭐⭐⭐
- ✅ Built into TightVNC
- ✅ Works natively with VNC
- ❌ Not supported by noVNC (browser client)
- ⚠️ Requires native VNC client

---

## Solution 1: WebRTC Data Channel File Transfer (Best for WebRTC)

### How It Works

```
Technician selects file
    ↓
File chunked into pieces (64KB each)
    ↓
Chunks sent via WebRTC Data Channel
    ↓
User's browser receives chunks
    ↓
Reassembles file
    ↓
Downloads automatically
```

### Implementation: File Transfer via Data Channel

```javascript
// File Transfer Manager
class FileTransferManager {
    constructor(dataChannel) {
        this.dataChannel = dataChannel;
        this.chunkSize = 64 * 1024; // 64KB chunks
        this.activeTransfers = new Map();
    }
    
    // Send file from technician to user
    async sendFile(file) {
        const transferId = this.generateTransferId();
        const totalChunks = Math.ceil(file.size / this.chunkSize);
        
        // Send file metadata
        this.dataChannel.send(JSON.stringify({
            type: 'file-start',
            transferId: transferId,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            totalChunks: totalChunks,
            direction: 'technician-to-user'
        }));
        
        // Send chunks
        for (let i = 0; i < totalChunks; i++) {
            const start = i * this.chunkSize;
            const end = Math.min(start + this.chunkSize, file.size);
            const chunk = file.slice(start, end);
            
            const arrayBuffer = await chunk.arrayBuffer();
            const base64 = this.arrayBufferToBase64(arrayBuffer);
            
            this.dataChannel.send(JSON.stringify({
                type: 'file-chunk',
                transferId: transferId,
                chunkIndex: i,
                data: base64,
                isLast: i === totalChunks - 1
            }));
            
            // Update progress
            this.updateProgress(transferId, (i + 1) / totalChunks);
            
            // Small delay to prevent overwhelming the channel
            await this.sleep(10);
        }
        
        // Send completion
        this.dataChannel.send(JSON.stringify({
            type: 'file-end',
            transferId: transferId,
            fileName: file.name
        }));
    }
    
    // Receive file on user side
    setupReceiver() {
        this.dataChannel.onmessage = (event) => {
            const message = JSON.parse(event.data);
            
            if (message.type === 'file-start') {
                this.handleFileStart(message);
            } else if (message.type === 'file-chunk') {
                this.handleFileChunk(message);
            } else if (message.type === 'file-end') {
                this.handleFileEnd(message);
            }
        };
    }
    
    handleFileStart(message) {
        const transfer = {
            transferId: message.transferId,
            fileName: message.fileName,
            fileSize: message.fileSize,
            fileType: message.fileType,
            totalChunks: message.totalChunks,
            chunks: new Array(message.totalChunks),
            receivedChunks: 0
        };
        
        this.activeTransfers.set(message.transferId, transfer);
        
        // Show file receive prompt
        this.showFileReceivePrompt(transfer);
    }
    
    handleFileChunk(message) {
        const transfer = this.activeTransfers.get(message.transferId);
        if (!transfer) return;
        
        // Store chunk
        transfer.chunks[message.chunkIndex] = message.data;
        transfer.receivedChunks++;
        
        // Update progress
        const progress = transfer.receivedChunks / transfer.totalChunks;
        this.updateProgress(message.transferId, progress);
        
        // Check if complete
        if (message.isLast && transfer.receivedChunks === transfer.totalChunks) {
            this.assembleFile(transfer);
        }
    }
    
    async assembleFile(transfer) {
        // Combine chunks
        const base64Data = transfer.chunks.join('');
        const blob = this.base64ToBlob(base64Data, transfer.fileType);
        
        // Create download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = transfer.fileName;
        a.click();
        
        URL.revokeObjectURL(url);
        
        // Cleanup
        this.activeTransfers.delete(transfer.transferId);
        
        // Show notification
        this.showNotification(`File received: ${transfer.fileName}`);
    }
    
    updateProgress(transferId, progress) {
        // Update progress bar
        const progressBar = document.getElementById(`progress-${transferId}`);
        if (progressBar) {
            progressBar.value = progress * 100;
            progressBar.textContent = `${Math.round(progress * 100)}%`;
        }
    }
    
    generateTransferId() {
        return 'transfer-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }
    
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
    
    base64ToBlob(base64, mimeType) {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
```

---

## Solution 2: HTTP Upload/Download via Server (Works with VNC)

### Architecture

```
Technician selects file
    ↓
Upload to server (HTTP POST)
    ↓
Server stores temporarily
    ↓
User downloads from server (HTTP GET)
    ↓
Server deletes file after download
```

### Implementation: Server-Side File Storage

```javascript
// routes/files.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB limit
    }
});

// Upload file (technician → server)
router.post('/api/files/upload', upload.single('file'), async (req, res) => {
    try {
        const { sessionId, direction } = req.body;
        const file = req.file;
        
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        // Store file metadata
        const fileRecord = {
            id: uuidv4(),
            sessionId: sessionId,
            originalName: file.originalname,
            storedName: file.filename,
            size: file.size,
            mimeType: file.mimetype,
            direction: direction, // 'technician-to-user' or 'user-to-technician'
            uploadedAt: new Date(),
            expiresAt: new Date(Date.now() + 3600000) // 1 hour
        };
        
        await saveFileRecord(fileRecord);
        
        // Notify recipient via WebSocket
        notifyFileAvailable(sessionId, fileRecord);
        
        res.json({
            success: true,
            fileId: fileRecord.id,
            fileName: file.originalName,
            downloadUrl: `/api/files/download/${fileRecord.id}`
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Download file (server → user/technician)
router.get('/api/files/download/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const fileRecord = await getFileRecord(fileId);
        
        if (!fileRecord) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        // Check expiry
        if (new Date() > fileRecord.expiresAt) {
            // Delete expired file
            await deleteFile(fileRecord.storedName);
            await deleteFileRecord(fileId);
            return res.status(410).json({ error: 'File expired' });
        }
        
        const filePath = path.join(__dirname, '../uploads', fileRecord.storedName);
        
        // Send file
        res.download(filePath, fileRecord.originalName, (err) => {
            if (err) {
                console.error('Download error:', err);
            } else {
                // Delete file after successful download
                setTimeout(() => {
                    deleteFile(fileRecord.storedName);
                    deleteFileRecord(fileId);
                }, 5000); // Wait 5 seconds before deletion
            }
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List files for session
router.get('/api/files/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const files = await getSessionFiles(sessionId);
        res.json({ files });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
```

### Client-Side: File Upload/Download

```javascript
// File Transfer UI Component
class FileTransferUI {
    constructor(sessionId) {
        this.sessionId = sessionId;
        this.serverUrl = 'https://your-server.com';
    }
    
    // Upload file (technician side)
    async uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('sessionId', this.sessionId);
        formData.append('direction', 'technician-to-user');
        
        const xhr = new XMLHttpRequest();
        
        // Progress tracking
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const progress = (e.loaded / e.total) * 100;
                this.updateUploadProgress(file.name, progress);
            }
        });
        
        return new Promise((resolve, reject) => {
            xhr.onload = () => {
                if (xhr.status === 200) {
                    const response = JSON.parse(xhr.responseText);
                    resolve(response);
                } else {
                    reject(new Error('Upload failed'));
                }
            };
            
            xhr.onerror = reject;
            xhr.open('POST', `${this.serverUrl}/api/files/upload`);
            xhr.send(formData);
        });
    }
    
    // Download file (user side)
    async downloadFile(fileId, fileName) {
        const url = `${this.serverUrl}/api/files/download/${fileId}`;
        
        // Create download link
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
    }
    
    // Show file receive notification
    showFileNotification(fileRecord) {
        const notification = document.createElement('div');
        notification.className = 'file-notification';
        notification.innerHTML = `
            <div class="file-notification-content">
                <h3>📁 File Received</h3>
                <p>${fileRecord.originalName}</p>
                <p>Size: ${this.formatFileSize(fileRecord.size)}</p>
                <button onclick="downloadFile('${fileRecord.id}', '${fileRecord.originalName}')">
                    Download
                </button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            notification.remove();
        }, 10000);
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
}
```

---

## Solution 3: VNC File Transfer (For VNC Connections)

### TightVNC File Transfer

**Configuration:**
```ini
# TightVNC Server Configuration
[admin]
FileTransferEnabled=1
FileTransferTimeout=30
```

**How It Works:**
- TightVNC has built-in file transfer
- Uses VNC File Transfer Protocol
- Works with native VNC clients
- ❌ **Not supported by noVNC** (browser client)

**Workaround for Browser Clients:**
- Use HTTP upload/download instead
- Or implement custom file transfer via WebSocket

---

## UI Components

### Technician Side: File Transfer Panel

```html
<div class="file-transfer-panel">
    <h3>📁 File Transfer</h3>
    
    <!-- Send File -->
    <div class="file-upload-section">
        <input type="file" id="fileInput" multiple />
        <button onclick="uploadFiles()">Send Files</button>
    </div>
    
    <!-- Active Transfers -->
    <div class="active-transfers" id="activeTransfers">
        <!-- Transfer items will appear here -->
    </div>
    
    <!-- Received Files -->
    <div class="received-files">
        <h4>Received Files</h4>
        <div id="receivedFilesList"></div>
    </div>
</div>
```

### User Side: File Receive Notification

```html
<div class="file-receive-notification" id="fileNotification" style="display:none;">
    <div class="notification-content">
        <h3>📁 File Received</h3>
        <p id="fileName"></p>
        <p id="fileSize"></p>
        <div class="progress-bar">
            <div class="progress" id="fileProgress"></div>
        </div>
        <button onclick="downloadFile()">Download</button>
        <button onclick="dismissNotification()">Dismiss</button>
    </div>
</div>
```

---

## Integration with Multi-Monitor Setup

### File Transfer Works Independently

**File transfer is independent of monitor configuration:**
- ✅ Works with single monitor
- ✅ Works with dual monitors
- ✅ Works with any monitor orientation
- ✅ Files transfer regardless of which monitor is shared

**Example Flow:**
1. User shares Monitor 1 (landscape)
2. Technician views Monitor 1
3. Technician sends file via Data Channel or HTTP
4. User receives file notification
5. File downloads successfully
6. Monitor configuration doesn't affect file transfer

---

## Bidirectional File Transfer

### Technician → User

```javascript
// Technician sends file to user
async function sendFileToUser(file) {
    if (dataChannel && dataChannel.readyState === 'open') {
        // Use WebRTC Data Channel
        await fileTransferManager.sendFile(file);
    } else {
        // Fallback to HTTP upload
        await fileTransferUI.uploadFile(file);
    }
}
```

### User → Technician

```javascript
// User sends file to technician
async function sendFileToTechnician(file) {
    if (dataChannel && dataChannel.readyState === 'open') {
        // Use WebRTC Data Channel
        await fileTransferManager.sendFile(file);
    } else {
        // Fallback to HTTP upload
        await fileTransferUI.uploadFile(file);
    }
}
```

---

## Security Considerations

### File Size Limits
- ✅ Set maximum file size (e.g., 100MB)
- ✅ Validate file types (optional)
- ✅ Rate limiting (prevent abuse)

### File Cleanup
- ✅ Auto-delete files after download
- ✅ Expire files after 1 hour
- ✅ Clean up old files periodically

### Access Control
- ✅ Verify session ownership
- ✅ Check session is active
- ✅ Validate file belongs to session

---

## Recommended Implementation

### Hybrid Approach (Best)

**Use WebRTC Data Channel when available:**
- ✅ Faster (direct P2P)
- ✅ No server storage needed
- ✅ Encrypted by default

**Fallback to HTTP when needed:**
- ✅ Works with VNC connections
- ✅ More reliable for large files
- ✅ Works through all firewalls

```javascript
class HybridFileTransfer {
    async sendFile(file, sessionId) {
        // Try WebRTC Data Channel first
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            try {
                return await this.sendViaDataChannel(file);
            } catch (error) {
                console.warn('Data Channel failed, falling back to HTTP');
            }
        }
        
        // Fallback to HTTP
        return await this.sendViaHTTP(file, sessionId);
    }
}
```

---

## Database Schema

```sql
CREATE TABLE file_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id),
    file_id UUID UNIQUE NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100),
    direction VARCHAR(20), -- 'technician-to-user' or 'user-to-technician'
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'downloaded', 'expired'
    uploaded_at TIMESTAMP DEFAULT NOW(),
    downloaded_at TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_file_transfers_session ON file_transfers(session_id);
CREATE INDEX idx_file_transfers_expires ON file_transfers(expires_at);
```

---

## Summary

### ✅ **File Transfer Solutions**

**Option 1: WebRTC Data Channel** (Best for WebRTC)
- ✅ Direct P2P transfer
- ✅ No server storage
- ✅ Fast and encrypted
- ✅ Works with WebRTC connections

**Option 2: HTTP Upload/Download** (Works with VNC)
- ✅ Reliable
- ✅ Works with all connections
- ✅ Server stores temporarily
- ✅ Works through firewalls

**Option 3: VNC File Transfer** (VNC only)
- ✅ Built into TightVNC
- ❌ Not supported by noVNC
- ⚠️ Requires native client

**Recommended**: **Hybrid Approach**
- Use WebRTC Data Channel when available
- Fallback to HTTP for VNC or when Data Channel unavailable

**Features:**
- ✅ Bidirectional transfer (both directions)
- ✅ Progress indicators
- ✅ File size limits
- ✅ Auto-cleanup
- ✅ Works with multi-monitor setup
- ✅ Secure and encrypted

**Result**: **Full file transfer support** for all connection types! 📁✅
