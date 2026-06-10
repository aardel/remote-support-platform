const jwt = require('jsonwebtoken');

// Tokens issued to customer-side agents (Electron helper / persistent device agent).
// Signed with JWT_SECRET; verified on socket connect and on helper-only REST endpoints.

function getSecret() {
    return process.env.JWT_SECRET || 'dev-jwt-secret';
}

// Issued when a session is assigned/registered for a device. Scoped to one session.
function signHelperToken({ sessionId, deviceId }) {
    return jwt.sign(
        { role: 'helper', sessionId, deviceId: deviceId || null },
        getSecret(),
        { expiresIn: '7d' }
    );
}

// Issued at device registration. Used for the persistent presence socket.
function signDeviceToken({ deviceId }) {
    return jwt.sign({ role: 'device', deviceId }, getSecret(), { expiresIn: '30d' });
}

function verifyAgentToken(token) {
    try {
        const payload = jwt.verify(token, getSecret());
        if (payload && (payload.role === 'helper' || payload.role === 'device')) return payload;
        return null;
    } catch (_) {
        return null;
    }
}

module.exports = { signHelperToken, signDeviceToken, verifyAgentToken };
