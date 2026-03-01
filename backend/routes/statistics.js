const express = require('express');
const router = express.Router();
const Session = require('../models/Session');
const { requireAuth } = require('../middleware/sessionAuth');

// GET /api/statistics/sessions — filterable session history for statistics page
router.get('/sessions', requireAuth, async (req, res) => {
    try {
        const { from, to, customer, deviceId, status } = req.query;
        const sessions = await Session.findForStatistics({ from, to, customer, deviceId, status });

        // Compute duration for each session
        const rows = sessions.map(s => {
            const start = s.connected_at || s.created_at;
            let end = s.ended_at || null;
            // If the session was reconnected and ended_at predates connected_at, ignore ended_at.
            if (start && end && new Date(end) < new Date(start)) {
                end = null;
            }
            if (!end) {
                end = s.status === 'connected' ? new Date() : s.updated_at;
            }
            const durationMs = start && end ? new Date(end) - new Date(start) : 0;
            return {
                sessionId: s.session_id,
                status: s.status,
                createdAt: s.created_at,
                connectedAt: s.connected_at,
                endedAt: s.ended_at,
                durationMs: Math.max(0, durationMs),
                customerName: s.customer_name || s.device_customer_name || null,
                machineName: s.machine_name || s.device_machine_name || s.device_display_name || null,
                os: (s.client_info && s.client_info.os) || s.device_os || null,
                hostname: (s.client_info && s.client_info.hostname) || s.device_hostname || null,
                ip: s.device_ip || null,
                country: s.device_country || null,
                region: s.device_region || null,
                city: s.device_city || null,
                deviceId: s.device_id
            };
        });

        // Summary
        const totalSessions = rows.length;
        const totalDurationMs = rows.reduce((sum, r) => sum + r.durationMs, 0);
        const uniqueCustomers = new Set(rows.map(r => r.customerName).filter(Boolean)).size;

        res.json({ sessions: rows, summary: { totalSessions, totalDurationMs, uniqueCustomers } });
    } catch (error) {
        console.error('Error loading statistics:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
