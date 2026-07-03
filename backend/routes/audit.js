const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/sessionAuth');
const AuditLog = require('../models/AuditLog');
const pool = require('../config/database');

// Recent audit events across all sessions.
router.get('/recent', requireAuth, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 200;
        const events = await AuditLog.recent(limit);
        res.json({ events });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Operations metrics: live counts + audit-derived activity.
router.get('/stats', requireAuth, async (req, res) => {
    try {
        const days = parseInt(req.query.days, 10) || 7;
        const [week, today] = await Promise.all([AuditLog.stats(days), AuditLog.stats(1)]);

        let activeSessions = 0, devices = 0, online = 0, versions = [];
        try {
            const a = await pool.query("SELECT COUNT(*)::int AS c FROM sessions WHERE status IN ('connected','waiting') AND expires_at > NOW()");
            activeSessions = a.rows[0].c;
        } catch (_) {}
        try {
            const d = await pool.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE last_seen > NOW() - interval '5 minutes')::int AS online FROM devices");
            devices = d.rows[0].total; online = d.rows[0].online;
        } catch (_) {}
        try {
            const v = await pool.query("SELECT COALESCE(helper_version, 'unknown') AS version, COUNT(*)::int AS count FROM devices GROUP BY helper_version ORDER BY count DESC");
            versions = v.rows;
        } catch (_) {}

        res.json({ days, week, today, activeSessions, devices, online, versions });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Audit trail for a single session (consent receipt).
router.get('/session/:sessionId', requireAuth, async (req, res) => {
    try {
        const events = await AuditLog.bySession(req.params.sessionId);
        res.json({ events });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
