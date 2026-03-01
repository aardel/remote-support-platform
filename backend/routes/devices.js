const express = require('express');
const router = express.Router();
const Device = require('../models/Device');
const SessionService = require('../services/sessionService');
const { requireAuth } = require('../middleware/sessionAuth');
const { geolocate, normalizeIp } = require('../services/geolocate');
const { sendWolPacket } = require('../services/wol');

function extractClientIp(req) {
    // Prefer x-forwarded-for when behind a proxy/load balancer.
    const xf = req.headers['x-forwarded-for'];
    if (xf) {
        const first = Array.isArray(xf) ? xf[0] : String(xf);
        const ip = normalizeIp(first);
        if (ip) return ip;
    }
    return normalizeIp(req.ip);
}

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
            allowUnattended,
            macAddress
        } = req.body;

        if (!deviceId) {
            return res.status(400).json({ error: 'deviceId required' });
        }

        const clientIp = extractClientIp(req);
        const device = await Device.upsert({
            deviceId,
            technicianId,
            displayName,
            os,
            hostname,
            arch,
            allowUnattended,
            lastIp: clientIp,
            macAddress
        });

        // Async geolocation — don't block the response
        if (clientIp) {
            geolocate(clientIp).then(geo => {
                if (!geo) return;
                Device.updateGeo(deviceId, geo).then((updated) => {
                    const io = req.app.get('io');
                    if (io && updated) {
                        io.emit('device-updated', {
                            deviceId,
                            last_ip: updated.last_ip,
                            last_country: updated.last_country,
                            last_region: updated.last_region,
                            last_city: updated.last_city
                        });
                    }
                }).catch(() => { });
            }).catch(() => { });
        }

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

// List devices (technician dashboard) — show all devices on this server
router.get('/', requireAuth, async (req, res) => {
    try {
        const devices = await Device.listAll();
        res.json({ devices });
    } catch (error) {
        console.error('Error listing devices:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete (deregister) a device
router.delete('/:deviceId', requireAuth, async (req, res) => {
    try {
        const { deviceId } = req.params;
        const deleted = await Device.deleteByDeviceId(deviceId);
        if (!deleted) {
            return res.status(404).json({ error: 'Device not found' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting device:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update device names (technician edits customer/machine name)
router.patch('/:deviceId', requireAuth, async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { customerName, machineName } = req.body;
        const device = await Device.updateNames(deviceId, { customerName, machineName });
        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }
        res.json({ success: true, device });
    } catch (error) {
        console.error('Error updating device:', error);
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

// Wake-on-LAN: send magic packet to wake an offline device
router.post('/:deviceId/wake', requireAuth, async (req, res) => {
    try {
        const { deviceId } = req.params;
        const device = await Device.findByDeviceId(deviceId);

        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }

        if (!device.mac_address) {
            return res.status(400).json({
                error: 'No MAC address stored for this device. The helper must be updated to send its MAC address during registration.'
            });
        }

        await sendWolPacket(device.mac_address);

        console.log(`[WOL] Magic packet sent for device ${deviceId} (MAC: ${device.mac_address})`);
        res.json({
            success: true,
            message: 'Wake-on-LAN packet sent',
            mac: device.mac_address
        });
    } catch (error) {
        console.error('Error sending WOL packet:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
