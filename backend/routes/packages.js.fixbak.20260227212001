const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const PackageBuilder = require('../services/packageBuilder');
const { requireAuth } = require('../middleware/sessionAuth');
const urlShortener = require('../services/urlShortener');

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

        // Notify dashboards in realtime that templates changed.
        try {
            const io = req.app.get('io');
            if (io) {
                io.emit('templates-updated', { templates: getTemplateStatus() });
            }
        } catch (_) {}

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
        const ttlDays = Math.max(1, Math.floor(Number(process.env.GENERATED_SESSION_TTL_DAYS || 20) || 20));
        const expiresIn = ttlDays * 24 * 60 * 60;
        const session = await SessionService.createSession({
            technicianId,
            expiresIn
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
        
        const origin = process.env.SUPPORT_URL || process.env.SERVER_URL || 'http://localhost:3000';
        const directLink = `${origin}/support/${sessionId}`;
        const downloadUrl = `${origin}/api/packages/download/${sessionId}`;
        
        // Get session expiration for short URL TTL (reuse session from above)
        const sessionExpiresIn = session?.expires_at ? Math.max(0, Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000 / 60)) : 20 * 24 * 60;
        
        // Generate short URLs at root level
        const shortCode = urlShortener.createShortUrl(directLink, sessionExpiresIn);
        const shortDownloadCode = urlShortener.createShortUrl(downloadUrl, sessionExpiresIn);
        const baseUrl = origin.replace(/\/remote.*$/, ''); // Remove /remote if present
        const shortLink = `${baseUrl}/${shortCode}`;
        const shortDownloadUrl = `${baseUrl}/${shortDownloadCode}`;

        // Broadcast to all dashboards so other technicians see it
        const io = req.app.get('io');
        if (io) {
            io.emit('session-created', {
                sessionId,
                status: 'waiting',
                technician_id: technicianId,
                created_at: new Date().toISOString(),
                link: directLink,
                shortLink,
                downloadUrl,
                shortDownloadUrl
            });
        }

        res.json({
            success: true,
            sessionId: sessionId,
            downloadUrl,
            shortDownloadUrl,
            directLink,
            shortLink
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
        const os = (req.query.os || '').toString().toLowerCase() || null;
        const refresh = (req.query.refresh || '').toString().toLowerCase() === '1' || (req.query.refresh || '').toString().toLowerCase() === 'true';

        const SessionService = require('../services/sessionService');
        const session = await SessionService.getSession(sessionId);

        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const packageBuilder = new PackageBuilder(
            process.env.SERVER_URL || 'http://localhost:3000'
        );

        let packagePath = await packageBuilder.getPackagePath(sessionId, type, os);

        // ZIP packages are always regenerated so users get the latest script
        // templates (e.g. XP-safe batch fixes). The text files are tiny and
        // bundle copies are idempotent, so this is cheap.
        if (type === 'zip') {
            const technicianId = session.technician_id || session.technicianId;
            const zipPath = packageBuilder.getZipPath(sessionId, packageBuilder.normalizeZipOs(os));
            try {
                if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
            } catch (_) {}
            await packageBuilder.buildPackage(sessionId, technicianId);
            await packageBuilder.createZipPackage(path.join(packageBuilder.packagesDir, sessionId), sessionId, { os });
            packagePath = await packageBuilder.getPackagePath(sessionId, type, os);

            if (!packagePath) {
                return res.status(500).json({ error: 'Failed to generate package' });
            }
        }

        if (!packagePath) {
            return res.status(404).json({ error: 'Package not available for requested type' });
        }

        const filename = packageBuilder.getDownloadName(sessionId, type, os);
        // Escape filename for Content-Disposition header (RFC 5987)
        const escapedFilename = filename.replace(/"/g, '\\"').replace(/[\r\n]/g, '');

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
            res.setHeader('Content-Disposition', `attachment; filename="${escapedFilename}"`);
            res.setHeader('Content-Length', modified.length);
            res.send(modified);
        } else {
            // For ZIP files, set headers explicitly to ensure correct filename
            const stats = fs.statSync(packagePath);
            res.setHeader('Content-Type', 'application/zip');
            // Discourage caching so users get latest launcher (e.g. verbose logging, persistent window)
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
            res.setHeader('Pragma', 'no-cache');
            // Use both filename and filename* (RFC 5987) for better browser compatibility
            res.setHeader('Content-Disposition', `attachment; filename="${escapedFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
            res.setHeader('Content-Length', stats.size);
            // Set cookie so IE iframe-based downloads can detect completion
            const dlToken = req.query.dltoken;
            if (dlToken) {
                res.cookie('downloadComplete', dlToken, { path: '/', httpOnly: false });
            }
            const fileStream = fs.createReadStream(packagePath);
            fileStream.pipe(res);
            fileStream.on('error', (err) => {
                console.error('Error streaming file:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Error downloading file' });
                }
            });
        }
    } catch (error) {
        console.error('Error downloading package:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
