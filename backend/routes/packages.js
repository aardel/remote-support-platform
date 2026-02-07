const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const PackageBuilder = require('../services/packageBuilder');
const { requireAuth } = require('../middleware/sessionAuth');

const upload = multer({ dest: '/tmp' });

function normalizeTemplateType(type) {
    const normalized = (type || '').toString().toLowerCase();
    if (normalized === 'exe' || normalized === 'dmg') {
        return normalized;
    }
    return null;
}

function getTemplateStatus() {
    const packagesDir = path.join(__dirname, '../../packages');
    const types = ['exe', 'dmg'];
    const templates = {};
    let version = null;
    const versionPath = path.join(packagesDir, 'support-template.version');
    if (fs.existsSync(versionPath)) {
        try {
            version = fs.readFileSync(versionPath, 'utf8').trim();
        } catch (e) { /* ignore */ }
    }

    for (const type of types) {
        const filePath = path.join(packagesDir, `support-template.${type}`);
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            templates[type] = {
                available: true,
                size: stats.size,
                updatedAt: stats.mtime,
                version: version
            };
        } else {
            templates[type] = {
                available: false,
                size: null,
                updatedAt: null,
                version: version
            };
        }
    }

    return templates;
}

// Get template status
router.get('/templates', requireAuth, async (req, res) => {
    try {
        const templates = getTemplateStatus();
        res.json({ templates });
    } catch (error) {
        console.error('Error getting template status:', error);
        res.status(500).json({ error: error.message });
    }
});

// Upload template helper (EXE/DMG)
router.post('/templates', requireAuth, upload.single('file'), async (req, res) => {
    try {
        const type = normalizeTemplateType(req.body?.type || req.query?.type);
        if (!type) {
            return res.status(400).json({ error: 'Invalid type. Use exe or dmg.' });
        }

        if (!req.file?.path) {
            return res.status(400).json({ error: 'Missing file upload.' });
        }

        const packagesDir = path.join(__dirname, '../../packages');
        if (!fs.existsSync(packagesDir)) {
            fs.mkdirSync(packagesDir, { recursive: true });
        }

        const targetPath = path.join(packagesDir, `support-template.${type}`);
        fs.renameSync(req.file.path, targetPath);

        res.json({
            success: true,
            type,
            path: targetPath
        });
    } catch (error) {
        console.error('Error uploading template:', error);
        res.status(500).json({ error: error.message });
    }
});

// Generate support package
router.post('/generate', requireAuth, async (req, res) => {
    try {
        const { technicianId: bodyTechnicianId } = req.body;
        const technicianId = bodyTechnicianId || req.user?.id || req.user?.nextcloudId;
        
        // Create session first
        const SessionService = require('../services/sessionService');
        const session = await SessionService.createSession({
            technicianId,
            expiresIn: 3600
        });
        
        // Generate package
        const packageBuilder = new PackageBuilder(
            process.env.SERVER_URL || 'http://localhost:3000'
        );
        
        const sessionId = session.session_id || session.sessionId;
        
        if (!sessionId) {
            return res.status(500).json({ error: 'Session ID not found in session object' });
        }
        
        const packageInfo = await packageBuilder.buildPackage(
            sessionId,
            technicianId
        );
        
        const directLink = `${process.env.SERVER_URL || 'http://localhost:3000'}/support/${sessionId}`;

        // Broadcast to all dashboards so other technicians see it
        const io = req.app.get('io');
        if (io) {
            io.emit('session-created', {
                sessionId,
                status: 'waiting',
                technician_id: technicianId,
                created_at: new Date().toISOString(),
                link: directLink,
                downloadUrl: `/api/packages/download/${sessionId}`
            });
        }

        res.json({
            success: true,
            sessionId: sessionId,
            downloadUrl: `/api/packages/download/${sessionId}`,
            directLink
        });
    } catch (error) {
        console.error('Error generating package:', error);
        res.status(500).json({ error: error.message });
    }
});

// Package manifest (OS-specific)
router.get('/manifest/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const packageBuilder = new PackageBuilder(
            process.env.SERVER_URL || 'http://localhost:3000'
        );

        const packages = await packageBuilder.getPackageManifest(sessionId);
        res.json({ sessionId, packages });
    } catch (error) {
        console.error('Error getting package manifest:', error);
        res.status(500).json({ error: error.message });
    }
});

// Download package
router.get('/download/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const type = (req.query.type || 'zip').toString().toLowerCase();

        const SessionService = require('../services/sessionService');
        const session = await SessionService.getSession(sessionId);

        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const packageBuilder = new PackageBuilder(
            process.env.SERVER_URL || 'http://localhost:3000'
        );

        let packagePath = await packageBuilder.getPackagePath(sessionId, type);

        // If package doesn't exist, generate it
        if (!packagePath && type === 'zip') {
            console.log(`Package not found for session ${sessionId}, generating...`);
            const technicianId = session.technician_id || session.technicianId;
            await packageBuilder.buildPackage(sessionId, technicianId);
            packagePath = await packageBuilder.getPackagePath(sessionId, type);

            if (!packagePath) {
                return res.status(500).json({ error: 'Failed to generate package' });
            }
        }

        if (!packagePath) {
            return res.status(404).json({ error: 'Package not available for requested type' });
        }

        const filename = packageBuilder.getDownloadName(sessionId, type);

        // For EXE/DMG, embed session ID by replacing placeholder
        if (type === 'exe' || type === 'dmg') {
            const fileBuffer = fs.readFileSync(packagePath);
            const placeholder = Buffer.from('___SESSID___');
            // Pad session ID to 12 chars to match placeholder length
            const paddedSessionId = sessionId.padEnd(12, '_');
            const sessionIdBuffer = Buffer.from(paddedSessionId);

            // Find and replace placeholder in buffer
            let modified = fileBuffer;
            let idx = fileBuffer.indexOf(placeholder);
            if (idx !== -1) {
                modified = Buffer.concat([
                    fileBuffer.slice(0, idx),
                    sessionIdBuffer,
                    fileBuffer.slice(idx + placeholder.length)
                ]);
                console.log(`Embedded session ID ${sessionId} in ${type} at offset ${idx}`);
            }

            const contentType = type === 'exe' ? 'application/x-msdownload' : 'application/x-apple-diskimage';
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Length', modified.length);
            res.send(modified);
        } else {
            res.download(packagePath, filename, (err) => {
                if (err) {
                    console.error('Error sending file:', err);
                    if (!res.headersSent) {
                        res.status(500).json({ error: 'Error downloading file' });
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error downloading package:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
