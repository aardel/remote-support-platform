const express = require('express');
const router = express.Router();
const Preference = require('../models/Preference');
const { requireAuth } = require('../middleware/sessionAuth');

function normalizeNonNegativeRate(value) {
    if (value === undefined) return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.round(parsed * 100) / 100;
}

// Get preferences for current technician
router.get('/', requireAuth, async (req, res) => {
    try {
        const technicianId = req.user?.id || req.user?.nextcloudId || req.user?.username;
        const pref = await Preference.findByTechnicianId(technicianId);
        res.json({
            dashboardLayout: pref?.dashboard_layout || null,
            sessionHistoryRetentionDays: pref?.session_history_retention_days ?? null,
            phoneSupportRate: Number(pref?.phone_support_rate ?? 0),
            whatsappSupportRate: Number(pref?.whatsapp_support_rate ?? 0),
            remoteControlSupportRate: Number(pref?.remote_control_support_rate ?? 0)
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
        const {
            dashboardLayout,
            sessionHistoryRetentionDays,
            phoneSupportRate,
            whatsappSupportRate,
            remoteControlSupportRate
        } = req.body;

        const pref = await Preference.upsert(technicianId, {
            dashboardLayout,
            sessionHistoryRetentionDays,
            phoneSupportRate: normalizeNonNegativeRate(phoneSupportRate),
            whatsappSupportRate: normalizeNonNegativeRate(whatsappSupportRate),
            remoteControlSupportRate: normalizeNonNegativeRate(remoteControlSupportRate)
        });

        res.json({ success: true, preferences: pref });
    } catch (error) {
        console.error('Error saving preferences:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
