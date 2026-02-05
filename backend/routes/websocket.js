const express = require('express');
const router = express.Router();

// WebSocket endpoint info (actual WebSocket handled in vncBridge)
router.get('/info', (req, res) => {
    res.json({
        websocketPort: process.env.WEBSOCKET_PORT || 6080,
        vncListenerPort: process.env.VNC_LISTENER_PORT || 5500,
        protocol: process.env.NODE_ENV === 'production' ? 'wss' : 'ws',
        path: '/websockify'
    });
});

module.exports = router;
