const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const sessionStore = require('../services/sessionStore');
const SessionService = require('../services/sessionService');
const { rateLimit } = require('../middleware/rateLimit');

// Reject anything not tied to a real, still-active session. sessionStore itself
// will happily create an entry for any string, so this is the actual boundary
// that stops someone posting messages/files against a made-up id.
async function requireLiveSession(req, res, next) {
    try {
        const session = await SessionService.getSession(req.params.sessionId);
        if (!session || (session.expires_at && new Date(session.expires_at) < new Date())) {
            return res.status(404).json({ error: 'Session not found or expired' });
        }
        next();
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

// Multer config (same pattern as routes/files.js)
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`)
});

const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// ── Chat Messages ──────────────────────────────────────────

// GET /api/bridge/:sessionId/messages?since=<timestamp>
// xp-chat.html polls this every 3s (~20/min) — rate limit is generous headroom, not a throttle on normal use.
router.get('/:sessionId/messages', rateLimit({ windowMs: 60 * 1000, max: 60 }), requireLiveSession, (req, res) => {
    const { sessionId } = req.params;
    const since = req.query.since || 0;
    const messages = sessionStore.getMessages(sessionId, since);
    res.json({ messages });
});

// POST /api/bridge/:sessionId/messages
router.post('/:sessionId/messages', rateLimit({ windowMs: 60 * 1000, max: 30 }), requireLiveSession, (req, res) => {
    const { sessionId } = req.params;
    const { message, sender } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'message is required' });
    }

    const msg = sessionStore.addMessage(sessionId, {
        sender: sender || 'Customer',
        role: 'customer',
        message
    });

    // Emit to technician via Socket.io
    const io = req.app.get('io');
    if (io) {
        io.to(`session-${sessionId}`).emit('chat-message', {
            sessionId,
            message: msg.message,
            sender: msg.sender,
            role: msg.role,
            timestamp: msg.timestamp
        });
    }

    res.json({ success: true, id: msg.id });
});

// ── Files ──────────────────────────────────────────────────

// GET /api/bridge/:sessionId/files
// xp-chat.html polls this every 10s (~6/min).
router.get('/:sessionId/files', rateLimit({ windowMs: 60 * 1000, max: 30 }), requireLiveSession, (req, res) => {
    const { sessionId } = req.params;
    const direction = req.query.direction; // optional filter
    const files = sessionStore.getFiles(sessionId, direction).map(f => ({
        id: f.id,
        name: f.name,
        size: f.size,
        direction: f.direction,
        uploadedAt: f.uploadedAt
    }));
    res.json({ files });
});

// GET /api/bridge/:sessionId/files/:fileId/download
router.get('/:sessionId/files/:fileId/download', rateLimit({ windowMs: 60 * 1000, max: 30 }), requireLiveSession, (req, res) => {
    const { sessionId, fileId } = req.params;
    const file = sessionStore.getFile(sessionId, fileId);
    if (!file || !file.storedPath) {
        return res.status(404).json({ error: 'File not found' });
    }
    if (!fs.existsSync(file.storedPath)) {
        return res.status(404).json({ error: 'File no longer available' });
    }
    res.download(file.storedPath, file.name);
});

// POST /api/bridge/:sessionId/files/upload
// Supports both XHR (JSON response) and iframe form submission (text response)
// sessionId is a route param here (unlike files.js), so the live-session check
// runs BEFORE multer touches disk — an invalid session never gets a file written.
router.post('/:sessionId/files/upload', rateLimit({ windowMs: 60 * 1000, max: 20 }), requireLiveSession, upload.single('file'), (req, res) => {
    const { sessionId } = req.params;
    const file = req.file;

    if (!file) {
        // For iframe submissions, respond with plain text
        if (req.headers.accept && req.headers.accept.includes('text/html')) {
            return res.status(400).send('No file selected');
        }
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileRecord = sessionStore.addFile(sessionId, {
        name: file.originalname,
        size: file.size,
        direction: 'from-customer',
        storedPath: file.path
    });

    // Notify technician via Socket.io
    const io = req.app.get('io');
    if (io) {
        io.to(`session-${sessionId}`).emit('file-available', {
            sessionId,
            id: fileRecord.id,
            original_name: fileRecord.name,
            originalName: fileRecord.name,
            size: fileRecord.size,
            downloadUrl: `/api/bridge/${sessionId}/files/${fileRecord.id}/download`
        });
    }

    // For iframe form submissions, return HTML that the iframe can display
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
        return res.send('<html><body>Upload successful: ' + file.originalname + '</body></html>');
    }
    res.json({ success: true, fileId: fileRecord.id, name: fileRecord.name });
});

module.exports = router;
