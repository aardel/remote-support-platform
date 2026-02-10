const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const sessionStore = require('../services/sessionStore');

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
router.get('/:sessionId/messages', (req, res) => {
    const { sessionId } = req.params;
    const since = req.query.since || 0;
    const messages = sessionStore.getMessages(sessionId, since);
    res.json({ messages });
});

// POST /api/bridge/:sessionId/messages
router.post('/:sessionId/messages', (req, res) => {
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
router.get('/:sessionId/files', (req, res) => {
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
router.get('/:sessionId/files/:fileId/download', (req, res) => {
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
router.post('/:sessionId/files/upload', upload.single('file'), (req, res) => {
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
