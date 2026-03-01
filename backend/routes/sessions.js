const express = require('express');
const router = express.Router();
const SessionService = require('../services/sessionService');
const Session = require('../models/Session');
const Device = require('../models/Device');
const Case = require('../models/Case');
const { requireAuth } = require('../middleware/sessionAuth');
const { geolocate, normalizeIp } = require('../services/geolocate');

function extractClientIp(req) {
    const xf = req.headers['x-forwarded-for'];
    if (xf) {
        const first = Array.isArray(xf) ? xf[0] : String(xf);
        const ip = normalizeIp(first);
        if (ip) return ip;
    }
    return normalizeIp(req.ip);
}

function computeRemoteViewingSeconds(sessionRow) {
    if (!sessionRow) return 0;
    let seconds = Number(sessionRow.billable_seconds || 0) || 0;
    const startedAt = sessionRow.billable_started_at ? new Date(sessionRow.billable_started_at).getTime() : null;
    if (startedAt && Number.isFinite(startedAt)) {
        seconds += Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    }
    return Math.max(0, Math.floor(seconds));
}

// Assign session for device (helper calls on launch – no auth)
router.post('/assign', async (req, res) => {
    try {
        const { deviceId, deviceName, os, hostname, arch, allowUnattended } = req.body;
        if (!deviceId) {
            return res.status(400).json({ error: 'deviceId required' });
        }
        const clientIp = extractClientIp(req);
        const result = await SessionService.assignSessionForDevice({
            deviceId,
            deviceName: deviceName || req.body.clientInfo?.hostname,
            os: os || req.body.clientInfo?.os,
            hostname: hostname || req.body.clientInfo?.hostname,
            arch: arch || req.body.clientInfo?.arch,
            allowUnattended: allowUnattended !== false,
            lastIp: clientIp
        });

        // Async geolocation update for device list
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
                }).catch(() => {});
            }).catch(() => {});
        }

        // Broadcast new/existing session to all dashboards so they update in real-time.
        // Use real status if available; do not force 'waiting' (can cause UI lockout).
        const io = req.app.get('io');
        if (io) {
            let status = 'waiting';
            let sessionRow = null;
            try {
                sessionRow = await SessionService.getSession(result.sessionId);
                if (sessionRow?.status) status = sessionRow.status;
            } catch (_) {}
            io.emit('session-created', {
                sessionId: result.sessionId,
                status,
                created_at: new Date().toISOString(),
                device_id: deviceId,
                client_info: { os, hostname, arch },
                helper_connected: sessionRow?.helper_connected,
                active_technicians: sessionRow?.active_technicians
            });
        }

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
            link: `${process.env.SERVER_URL || process.env.SUPPORT_URL || ''}/support/${sessionId}`,
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

        // Ensure session exists (prevents update() returning undefined and later crashes).
        const existing = await SessionService.getSession(sessionId);
        if (!existing) {
            return res.status(404).json({ error: 'Session not found' });
        }

        // Merge capabilities into clientInfo for storage
        const enrichedClientInfo = { ...clientInfo, capabilities: capabilities || {} };

        const sessionUpdate = {
            client_info: enrichedClientInfo,
            vnc_port: vncPort || 5900,
            device_id: deviceId || null,
            status: 'connected',
            // Only set connected_at once per session so statistics duration stays stable.
            connected_at: existing.connected_at || new Date(),
            // Clear end markers on reconnect so stats and dashboards do not treat it as ended.
            ended_at: null
        };
        if (typeof allowUnattended === 'boolean') {
            sessionUpdate.allow_unattended = allowUnattended;
        }

        // Snapshot customer/machine name from device record so dashboards and statistics show stable labels.
        if (deviceId) {
            try {
                const device = await Device.findByDeviceId(deviceId);
                if (device) {
                    if (!existing.customer_name && device.customer_name) sessionUpdate.customer_name = device.customer_name;
                    if (!existing.machine_name && (device.machine_name || device.display_name)) sessionUpdate.machine_name = device.machine_name || device.display_name;
                }
            } catch (_) {}
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
            const forwarded = req.headers['x-forwarded-for'];
            const rawIp = (Array.isArray(forwarded) ? forwarded[0] : (forwarded || '')).split(',')[0].trim();
            const clientIp = rawIp || req.ip;
            console.log(`[VNC-MAP] Session ${sessionId}: x-forwarded-for=${forwarded || 'none'}, req.ip=${req.ip}, using=${clientIp}`);
            vncBridge.mapSessionToConnection(sessionId, {
                clientInfo,
                vncPort: vncPort || 5900,
                clientIp
            });
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

// Compatibility case endpoints used by SessionView
router.get('/:sessionId/case', requireAuth, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const caseReport = await Case.findLatestBySessionId(sessionId);
        if (!caseReport) return res.json({ caseReport: null });
        res.json({ caseReport });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

async function upsertCaseFromSession(req, res, status) {
    const { sessionId } = req.params;
    const { notes, phoneMinutes, whatsappMinutes, remoteViewingSeconds } = req.body || {};
    const session = await SessionService.getSession(sessionId);
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }

    const phoneMin = Math.max(0, Math.floor(Number(phoneMinutes) || 0));
    const whatsappMin = Math.max(0, Math.floor(Number(whatsappMinutes) || 0));
    const remoteSeconds = Math.max(
        0,
        Math.floor(Number(remoteViewingSeconds ?? computeRemoteViewingSeconds(session)) || 0)
    );
    const technicianId = req.user?.id || req.user?.nextcloudId || req.user?.username || 'technician';
    const technicianName = req.user?.username || 'Technician';
    const billableTotalSeconds = remoteSeconds + (phoneMin * 60) + (whatsappMin * 60);
    const description = String(notes || '').trim() || 'Session notes';

    const existing = await Case.findLatestBySessionId(sessionId);
    let row;
    if (existing) {
        row = await Case.updateById(existing.id, {
            status,
            problemDescription: description,
            remoteViewingSeconds: remoteSeconds,
            phoneSupportMinutes: phoneMin,
            whatsappSupportMinutes: whatsappMin,
            billableTotalSeconds,
            technicianId,
            technicianName
        });
    } else {
        row = await Case.create({
            sessionId,
            deviceId: session.device_id || null,
            customerName: session.customer_name || null,
            machineName: session.machine_name || null,
            technicianId,
            technicianName,
            status,
            problemDescription: description,
            remoteViewingSeconds: remoteSeconds,
            phoneSupportMinutes: phoneMin,
            whatsappSupportMinutes: whatsappMin,
            billableTotalSeconds
        });
    }

    return res.json({ success: true, caseReport: row });
}

router.post('/:sessionId/case', requireAuth, async (req, res) => {
    try {
        return await upsertCaseFromSession(req, res, 'open');
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/:sessionId/case/close', requireAuth, async (req, res) => {
    try {
        return await upsertCaseFromSession(req, res, 'closed');
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List all active sessions (visible to all technicians)
router.get('/', requireAuth, async (req, res) => {
    try {
        const sessions = await Session.findAllActive();
        res.json({ sessions });
    } catch (error) {
        // Fallback to in-memory sessions
        const sessions = Array.from(SessionService.inMemorySessions.values());
        res.json({ sessions });
    }
});

// Delete session
router.delete('/:sessionId', requireAuth, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const PackageArtifacts = require('../services/packageArtifacts');

        // Try database first
        try {
            await Session.delete(sessionId);
        } catch (error) {
            // Fallback to in-memory
            SessionService.inMemorySessions.delete(sessionId);
        }

        // Best-effort: delete any generated package artifacts for this session on disk.
        try {
            await PackageArtifacts.deleteArtifactsForSession({ sessionId });
        } catch (_) {}

        // Notify via WebSocket (broadcast globally so all dashboards update)
        const io = req.app.get('io');
        if (io) {
            io.emit('session-ended', { sessionId });
        }

        res.json({ success: true, message: 'Session deleted' });
    } catch (error) {
        console.error('Error deleting session:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
