const express = require('express');
const router = express.Router();
const Preference = require('../models/Preference');
const { requireAuth } = require('../middleware/sessionAuth');

// Get preferences for current technician
router.get('/', requireAuth, async (req, res) => {
    try {
        const technicianId = req.user?.id || req.user?.nextcloudId || req.user?.username;
        const pref = await Preference.findByTechnicianId(technicianId);
        res.json({
            dashboardLayout: pref?.dashboard_layout || null,
            sessionHistoryRetentionDays: pref?.session_history_retention_days ?? null
        });
    } catch (error) {
        console.error('Error loading preferences:', error);
        res.status(500).json({ error: error.message });
    }
});

// Save preferences for current technician
router.put('/', requireAuth, async (req, res) => {
    try {
        const technicianId = req.user?.id || req.user?.nextcloudId || req.user?.username;
        const { dashboardLayout, sessionHistoryRetentionDays } = req.body;
        const pref = await Preference.upsert(technicianId, { dashboardLayout, sessionHistoryRetentionDays });
        res.json({ success: true, preferences: pref });
    } catch (error) {
        console.error('Error saving preferences:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
