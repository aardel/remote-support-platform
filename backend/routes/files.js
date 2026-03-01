const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const FileTransfer = require('../models/FileTransfer');

// Configure multer for file uploads
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
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

// In-memory file records (fallback if database not available)
const fileRecords = new Map();

// Upload file
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const { sessionId, direction } = req.body;
        const file = req.file;
        
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        let fileRecord;
        
        try {
            // Try database first
            fileRecord = await FileTransfer.create({
                sessionId,
                originalName: file.originalname,
                storedName: file.filename,
                size: file.size,
                mimeType: file.mimetype,
                direction: direction || 'technician-to-user'
            });
        } catch (error) {
            // Fallback to in-memory
            console.warn('Database not available, using in-memory storage');
            fileRecord = {
                id: require('uuid').v4(),
                session_id: sessionId,
                original_name: file.originalname,
                stored_name: file.filename,
                file_size: file.size,
                mime_type: file.mimetype,
                direction: direction || 'technician-to-user',
                uploaded_at: new Date(),
                expires_at: new Date(Date.now() + 3600000)
            };
            fileRecords.set(fileRecord.id, fileRecord);
        }
        
        // Notify recipient via WebSocket
        const io = req.app.get('io');
        if (io) {
            io.to(`session-${sessionId}`).emit('file-available', fileRecord);
        }
        
        res.json({
            success: true,
            fileId: fileRecord.id,
            fileName: fileRecord.original_name || fileRecord.originalName,
            downloadUrl: `/api/files/download/${fileRecord.id}`
        });
    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).json({ error: error.message });
    }
});

// Download file
router.get('/download/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        
        let fileRecord;
        try {
            fileRecord = await FileTransfer.findById(fileId);
        } catch (error) {
            // Fallback to in-memory
            fileRecord = fileRecords.get(fileId);
        }
        
        if (!fileRecord) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        const storedName = fileRecord.stored_name || fileRecord.storedName;
        const originalName = fileRecord.original_name || fileRecord.originalName;
        const expiresAt = fileRecord.expires_at || fileRecord.expiresAt;
        
        // Check expiry
        if (new Date() > new Date(expiresAt)) {
            // Delete expired file
            const filePath = path.join(uploadDir, storedName);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            try {
                await FileTransfer.delete(fileId);
            } catch (error) {
                fileRecords.delete(fileId);
            }
            return res.status(410).json({ error: 'File expired' });
        }
        
        const filePath = path.join(uploadDir, storedName);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found on disk' });
        }
        
        // Mark as downloaded
        try {
            await FileTransfer.markDownloaded(fileId);
        } catch (error) {
            // Ignore if using in-memory
        }
        
        // Send file
        res.download(filePath, originalName, (err) => {
            if (err) {
                console.error('Download error:', err);
            } else {
                // Delete file after successful download (after delay)
                setTimeout(async () => {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                    try {
                        await FileTransfer.delete(fileId);
                    } catch (error) {
                        fileRecords.delete(fileId);
                    }
                }, 5000);
            }
        });
    } catch (error) {
        console.error('Error downloading file:', error);
        res.status(500).json({ error: error.message });
    }
});

// List files for session
router.get('/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        let files;
        try {
            files = await FileTransfer.findBySession(sessionId);
        } catch (error) {
            // Fallback to in-memory
            files = Array.from(fileRecords.values())
                .filter(f => (f.session_id || f.sessionId) === sessionId);
        }
        
        res.json({ files });
    } catch (error) {
        console.error('Error listing files:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
