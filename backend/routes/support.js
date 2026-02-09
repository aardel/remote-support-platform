const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const SessionService = require('../services/sessionService');

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (Array.isArray(forwarded) ? forwarded[0] : (forwarded || '')).split(',')[0].trim() || req.ip;
    if (!ip) return null;
    if (ip.startsWith('::ffff:')) return ip.slice(7);
    return ip;
}

router.get('/suggest', async (req, res) => {
    try {
        const ip = getClientIp(req);
        if (!ip) {
            return res.json({ ip: null, suggestions: [] });
        }

        const query = `
            SELECT s.session_id, s.status, s.created_at, s.expires_at, s.device_id,
                   d.customer_name, d.machine_name, d.display_name, d.hostname, d.os,
                   d.last_seen, d.last_ip
            FROM sessions s
            LEFT JOIN devices d ON s.device_id = d.device_id
            WHERE s.expires_at > NOW()
              AND d.last_ip = $1
            ORDER BY s.created_at DESC
            LIMIT 5
        `;
        const result = await pool.query(query, [ip]);

        const origin = `${req.protocol}://${req.get('host')}`;
        const suggestions = result.rows.map(row => {
            const sid = row.session_id;
            return {
                sessionId: sid,
                status: row.status,
                createdAt: row.created_at,
                expiresAt: row.expires_at,
                deviceId: row.device_id,
                customerName: row.customer_name,
                machineName: row.machine_name,
                displayName: row.display_name,
                hostname: row.hostname,
                os: row.os,
                lastSeen: row.last_seen,
                supportUrl: `${origin}/support/${encodeURIComponent(sid)}`,
                downloadUrl: `${origin}/api/packages/download/${encodeURIComponent(sid)}?type=zip`
            };
        });

        res.json({ ip, suggestions });
    } catch (error) {
        console.error('Error suggesting support session:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/create', async (req, res) => {
    try {
        const ttlDays = Math.max(1, Math.floor(Number(process.env.GENERATED_SESSION_TTL_DAYS || 20) || 20));
        const expiresIn = ttlDays * 24 * 60 * 60;
        const session = await SessionService.createSession({
            technicianId: null,
            expiresIn
        });

        const sessionId = session.session_id || session.sessionId;
        if (!sessionId) {
            return res.status(500).json({ error: 'Session ID not found in session object' });
        }

        const origin = `${req.protocol}://${req.get('host')}`;
        const directLink = `${origin}/support/${encodeURIComponent(sessionId)}`;
        const downloadUrl = `${origin}/api/packages/download/${encodeURIComponent(sessionId)}?type=zip`;

        const io = req.app.get('io');
        if (io) {
            io.emit('session-created', {
                sessionId,
                status: 'waiting',
                technician_id: null,
                created_at: new Date().toISOString(),
                link: directLink,
                downloadUrl
            });
        }

        res.json({
            success: true,
            sessionId,
            directLink,
            downloadUrl
        });
    } catch (error) {
        console.error('Error creating support session:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
