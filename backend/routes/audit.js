const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/sessionAuth');
const AuditLog = require('../models/AuditLog');

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
