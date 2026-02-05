const express = require('express');
const router = express.Router();
const PackageBuilder = require('../services/packageBuilder');

// Generate support package
router.post('/generate', async (req, res) => {
    try {
        const { technicianId } = req.body;
        
        if (!technicianId) {
            return res.status(400).json({ error: 'Technician ID required' });
        }
        
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

// Download package
router.get('/download/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const SessionService = require('../services/sessionService');
        const session = await SessionService.getSession(sessionId);
        
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }
        
        const packageBuilder = new PackageBuilder(
            process.env.SERVER_URL || 'http://localhost:3000'
        );
        
        let packagePath = await packageBuilder.getPackagePath(sessionId);
        
        // If package doesn't exist, generate it
        if (!packagePath) {
            console.log(`Package not found for session ${sessionId}, generating...`);
            const technicianId = session.technician_id || session.technicianId;
            await packageBuilder.buildPackage(sessionId, technicianId);
            packagePath = await packageBuilder.getPackagePath(sessionId);
            
            if (!packagePath) {
                return res.status(500).json({ error: 'Failed to generate package' });
            }
        }
        
        res.download(packagePath, `support-helper-${sessionId}.zip`, (err) => {
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
