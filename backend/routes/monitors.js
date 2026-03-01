const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/sessionAuth');

// Get monitors for session
router.get('/session/:sessionId', requireAuth, async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        // TODO: Get monitor info from session/client
        // For now, return placeholder
        res.json({
            monitors: [],
            currentMonitor: 0,
            allowSwitching: true
        });
    } catch (error) {
        console.error('Error getting monitors:', error);
        res.status(500).json({ error: error.message });
    }
});

// Switch monitor
router.post('/session/:sessionId/switch', requireAuth, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { monitorIndex } = req.body;
        
        // TODO: Implement monitor switching
        // Notify client to switch monitor
        
        const io = req.app.get('io');
        if (io) {
            io.to(`session-${sessionId}`).emit('switch-monitor', {
                monitorIndex
            });
        }
        
        res.json({
            success: true,
            monitorIndex
        });
    } catch (error) {
        console.error('Error switching monitor:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
