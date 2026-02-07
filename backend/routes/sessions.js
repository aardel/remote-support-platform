const express = require('express');
const router = express.Router();
const SessionService = require('../services/sessionService');
const Session = require('../models/Session');
const Device = require('../models/Device');
const { requireAuth } = require('../middleware/sessionAuth');

// Assign session for device (helper calls on launch – no auth)
router.post('/assign', async (req, res) => {
    try {
        const { deviceId, deviceName, os, hostname, arch, allowUnattended } = req.body;
        if (!deviceId) {
            return res.status(400).json({ error: 'deviceId required' });
        }
        const result = await SessionService.assignSessionForDevice({
            deviceId,
            deviceName: deviceName || req.body.clientInfo?.hostname,
            os: os || req.body.clientInfo?.os,
            hostname: hostname || req.body.clientInfo?.hostname,
            arch: arch || req.body.clientInfo?.arch,
            allowUnattended: allowUnattended !== false,
            lastIp: req.ip
        });
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Error assigning session:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create new session
router.post('/create', requireAuth, async (req, res) => {
    try {
        const { technicianId: bodyTechnicianId } = req.body;
        const technicianId = bodyTechnicianId || req.user?.id || req.user?.nextcloudId;

        const session = await SessionService.createSession({
            technicianId,
            expiresIn: 3600 // 1 hour
        });
        
        const sessionId = session.session_id || session.sessionId;
        const expiresAt = session.expires_at || session.expiresAt;
        
        res.json({
            success: true,
            sessionId: sessionId,
            link: `${process.env.SERVER_URL || 'http://localhost:3000'}/support/${sessionId}`,
            expiresAt: expiresAt
        });
    } catch (error) {
        console.error('Error creating session:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get session info
router.get('/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await SessionService.getSession(sessionId);
        
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }
        
        // Format response
        res.json({
            sessionId: session.session_id || session.sessionId,
            technicianId: session.technician_id || session.technicianId,
            status: session.status,
            allowUnattended: session.allow_unattended !== false,
            clientInfo: session.client_info || session.clientInfo,
            vncPort: session.vnc_port || session.vncPort,
            createdAt: session.created_at || session.createdAt,
            expiresAt: session.expires_at || session.expiresAt,
            connectedAt: session.connected_at || session.connectedAt
        });
    } catch (error) {
        console.error('Error getting session:', error);
        res.status(500).json({ error: error.message });
    }
});

// Register session (when user connects)
router.post('/register', async (req, res) => {
    try {
        const { sessionId, clientInfo, allowUnattended, vncPort, deviceId, deviceName, capabilities } = req.body;

        // Merge capabilities into clientInfo for storage
        const enrichedClientInfo = { ...clientInfo, capabilities: capabilities || {} };

        const sessionUpdate = {
            client_info: enrichedClientInfo,
            vnc_port: vncPort || 5900,
            device_id: deviceId || null,
            status: 'connected',
            connected_at: new Date()
        };
        if (typeof allowUnattended === 'boolean') {
            sessionUpdate.allow_unattended = allowUnattended;
        }

        const session = await SessionService.registerSession(sessionId, sessionUpdate);

        // Upsert device registration
        if (deviceId) {
            try {
                await Device.upsert({
                    deviceId,
                    technicianId: session.technician_id || session.technicianId,
                    displayName: deviceName,
                    os: clientInfo?.os,
                    hostname: clientInfo?.hostname,
                    arch: clientInfo?.arch,
                    allowUnattended: allowUnattended !== false,
                    lastIp: req.ip
                });

                // Clear pending session for this device if matches
                const device = await Device.findByDeviceId(deviceId);
                if (device?.pending_session_id === sessionId) {
                    await Device.clearPendingSession(deviceId);
                }
            } catch (error) {
                console.warn('Device registration failed:', error.message);
            }
        }
        
        // Map VNC connection if bridge is available
        const vncBridge = req.app.get('vncBridge');
        if (vncBridge) {
            // Store session mapping for VNC connections
            vncBridge.mapSessionToConnection(sessionId, {
                clientInfo,
                vncPort: vncPort || 5900
            });
            console.log(`Session ${sessionId} registered, waiting for VNC connection`);
        }
        
        // Notify technician via WebSocket
        const io = req.app.get('io');
        if (io) {
            // Emit to specific session room
            io.to(`session-${sessionId}`).emit('session-connected', {
                sessionId,
                clientInfo: enrichedClientInfo,
                capabilities: capabilities || {},
                status: 'connected'
            });
            // Also broadcast globally for dashboard updates
            io.emit('session-updated', {
                sessionId,
                clientInfo: enrichedClientInfo,
                status: 'connected'
            });
        }
        
        res.json({
            success: true,
            message: 'Session registered',
            sessionId
        });
    } catch (error) {
        console.error('Error registering session:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update session settings (customer controls)
router.patch('/:sessionId/settings', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { allowUnattended } = req.body;

        const session = await SessionService.getSession(sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const updated = await SessionService.updateSession(sessionId, {
            allow_unattended: allowUnattended !== false
        });

        res.json({
            success: true,
            sessionId,
            allowUnattended: updated.allow_unattended !== false
        });
    } catch (error) {
        console.error('Error updating session settings:', error);
        res.status(500).json({ error: error.message });
    }
});

// Request connection approval
router.post('/:sessionId/connect', requireAuth, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { technicianId: bodyTechnicianId, technicianName } = req.body;
        const technicianId = bodyTechnicianId || req.user?.id || req.user?.nextcloudId;
        const resolvedName = technicianName || req.user?.username || 'Unknown';
        
        const session = await SessionService.getSession(sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }
        
        // Use approval handler
        const approvalHandler = req.app.get('approvalHandler');
        const approval = await approvalHandler.requestConnectionApproval(sessionId, {
            id: technicianId,
            name: resolvedName
        });
        
        res.json({
            success: true,
            approved: approval.approved,
            autoApproved: approval.autoApproved || false,
            reason: approval.reason
        });
    } catch (error) {
        console.error('Error requesting connection:', error);
        res.status(500).json({ error: error.message });
    }
});

// Handle approval response
router.post('/:sessionId/approval', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { approved } = req.body;
        
        // Handle via approval handler if available
        const approvalHandler = req.app.get('approvalHandler');
        if (approvalHandler) {
            approvalHandler.handleApprovalResponse(sessionId, approved);
        } else {
            // Fallback to session service
            await SessionService.handleApprovalResponse(sessionId, approved);
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error handling approval:', error);
        res.status(500).json({ error: error.message });
    }
});

// List all sessions for technician
router.get('/', requireAuth, async (req, res) => {
    try {
        const technicianId = req.user?.id || req.user?.nextcloudId;
        const sessions = await Session.findByTechnician(technicianId);
        res.json({ sessions });
    } catch (error) {
        // Fallback to in-memory sessions
        const sessions = Array.from(SessionService.inMemorySessions.values())
            .filter(s => s.technician_id === (req.user?.id || req.user?.nextcloudId));
        res.json({ sessions });
    }
});

// Delete session
router.delete('/:sessionId', requireAuth, async (req, res) => {
    try {
        const { sessionId } = req.params;

        // Try database first
        try {
            await Session.delete(sessionId);
        } catch (error) {
            // Fallback to in-memory
            SessionService.inMemorySessions.delete(sessionId);
        }

        // Notify via WebSocket
        const io = req.app.get('io');
        if (io) {
            io.to(`session-${sessionId}`).emit('session-ended', { sessionId });
        }

        res.json({ success: true, message: 'Session deleted' });
    } catch (error) {
        console.error('Error deleting session:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
