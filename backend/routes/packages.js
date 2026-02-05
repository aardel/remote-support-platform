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

    for (const type of types) {
        const filePath = path.join(packagesDir, `support-template.${type}`);
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            templates[type] = {
                available: true,
                size: stats.size,
                updatedAt: stats.mtime
            };
        } else {
            templates[type] = {
                available: false,
                size: null,
                updatedAt: null
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
        
        res.json({
            success: true,
            sessionId: sessionId,
            downloadUrl: `/api/packages/download/${sessionId}`,
            directLink: `${process.env.SERVER_URL || 'http://localhost:3000'}/support/${sessionId}`
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

        res.download(packagePath, filename, (err) => {
            if (err) {
                console.error('Error sending file:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Error downloading file' });
                }
            }
        });
    } catch (error) {
        console.error('Error downloading package:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
