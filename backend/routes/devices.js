const express = require('express');
const router = express.Router();
const Device = require('../models/Device');
const SessionService = require('../services/sessionService');
const { requireAuth } = require('../middleware/sessionAuth');

// Register or update device (called by helper)
router.post('/register', async (req, res) => {
    try {
        const {
            deviceId,
            technicianId,
            displayName,
            os,
            hostname,
            arch,
            allowUnattended
        } = req.body;

        if (!deviceId) {
            return res.status(400).json({ error: 'deviceId required' });
        }

        const device = await Device.upsert({
            deviceId,
            technicianId,
            displayName,
            os,
            hostname,
            arch,
            allowUnattended,
            lastIp: req.ip
        });

        res.json({ success: true, device });
    } catch (error) {
        console.error('Error registering device:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get pending session for device (helper polls on launch)
router.get('/pending/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const device = await Device.findByDeviceId(deviceId);

        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }

        if (!device.pending_session_id) {
            return res.json({ pending: false });
        }

        res.json({
            pending: true,
            sessionId: device.pending_session_id
        });
    } catch (error) {
        console.error('Error checking pending session:', error);
        res.status(500).json({ error: error.message });
    }
});

// List devices (technician dashboard)
router.get('/', requireAuth, async (req, res) => {
    try {
        const technicianId = req.user?.id || req.user?.nextcloudId;
        const devices = await Device.listByTechnician(technicianId);
        res.json({ devices });
    } catch (error) {
        console.error('Error listing devices:', error);
        res.status(500).json({ error: error.message });
    }
});

// Request session for a device (technician dashboard)
router.post('/:deviceId/request', requireAuth, async (req, res) => {
    try {
        const { deviceId } = req.params;
        const technicianId = req.user?.id || req.user?.nextcloudId;

        const device = await Device.findByDeviceId(deviceId);
        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }

        const session = await SessionService.createSession({
            technicianId,
            expiresIn: 3600
        });

        const sessionId = session.session_id || session.sessionId;
        await Device.setPendingSession(deviceId, sessionId);

        res.json({
            success: true,
            sessionId,
            message: 'Session requested. Ask the user to open the helper.'
        });
    } catch (error) {
        console.error('Error requesting session:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
