const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

class SessionStore {
    constructor() {
        // sessionId -> { messages: [], files: [], createdAt }
        this.sessions = new Map();
    }

    _getOrCreate(sessionId) {
        if (!this.sessions.has(sessionId)) {
            this.sessions.set(sessionId, {
                messages: [],
                files: [],
                createdAt: Date.now()
            });
        }
        return this.sessions.get(sessionId);
    }

    addMessage(sessionId, { sender, role, message }) {
        const store = this._getOrCreate(sessionId);
        const msg = {
            id: uuidv4(),
            sender: sender || (role === 'technician' ? 'Technician' : 'Customer'),
            role: role || 'customer',
            message,
            timestamp: Date.now()
        };
        store.messages.push(msg);
        return msg;
    }

    getMessages(sessionId, since) {
        const store = this.sessions.get(sessionId);
        if (!store) return [];
        if (since) {
            const ts = Number(since);
            return store.messages.filter(m => m.timestamp > ts);
        }
        return store.messages;
    }

    addFile(sessionId, { name, size, direction, storedPath }) {
        const store = this._getOrCreate(sessionId);
        const file = {
            id: uuidv4(),
            name,
            size: size || 0,
            direction: direction || 'to-customer', // 'to-customer' or 'from-customer'
            storedPath,
            uploadedAt: Date.now()
        };
        store.files.push(file);
        return file;
    }

    /**
     * Store a file from base64 content (used when technician sends via Socket.io put-remote-file).
     */
    addFileFromBase64(sessionId, { filename, content }) {
        const uploadDir = path.join(__dirname, '../../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        const storedName = `${uuidv4()}-${filename}`;
        const storedPath = path.join(uploadDir, storedName);
        const buf = Buffer.from(content, 'base64');
        fs.writeFileSync(storedPath, buf);
        return this.addFile(sessionId, {
            name: filename,
            size: buf.length,
            direction: 'to-customer',
            storedPath
        });
    }

    getFiles(sessionId, direction) {
        const store = this.sessions.get(sessionId);
        if (!store) return [];
        if (direction) {
            return store.files.filter(f => f.direction === direction);
        }
        return store.files;
    }

    getFile(sessionId, fileId) {
        const store = this.sessions.get(sessionId);
        if (!store) return null;
        return store.files.find(f => f.id === fileId) || null;
    }

    cleanup(sessionId) {
        const store = this.sessions.get(sessionId);
        if (store) {
            // Delete stored files from disk
            for (const f of store.files) {
                if (f.storedPath && fs.existsSync(f.storedPath)) {
                    try { fs.unlinkSync(f.storedPath); } catch (_) {}
                }
            }
        }
        this.sessions.delete(sessionId);
    }

    /**
     * Remove sessions older than TTL.
     */
    purgeExpired() {
        const now = Date.now();
        for (const [sessionId, store] of this.sessions) {
            if (now - store.createdAt > TTL_MS) {
                this.cleanup(sessionId);
            }
        }
    }
}

// Singleton
const sessionStore = new SessionStore();

// Purge expired entries every hour
setInterval(() => sessionStore.purgeExpired(), 60 * 60 * 1000);

module.exports = sessionStore;
