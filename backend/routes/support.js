const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const SessionService = require('../services/sessionService');
const urlShortener = require('../services/urlShortener');

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

        const origin = process.env.SUPPORT_URL || `${req.protocol}://${req.get('host')}`;
        const suggestions = result.rows.map(row => {
            const sid = row.session_id;
            const fullSupportUrl = `${origin}/support/${encodeURIComponent(sid)}`;
            const fullDownloadUrl = `${origin}/api/packages/download/${encodeURIComponent(sid)}?type=zip`;
            
            // Generate short URLs at root level (expires when session expires)
            const expiresIn = row.expires_at ? Math.max(0, Math.floor((new Date(row.expires_at).getTime() - Date.now()) / 1000 / 60)) : 20 * 24 * 60;
            const shortCode = urlShortener.createShortUrl(fullSupportUrl, expiresIn);
            const shortDownloadCode = urlShortener.createShortUrl(fullDownloadUrl, expiresIn);
            const baseUrl = origin.replace(/\/remote.*$/, ''); // Remove /remote if present
            
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
                supportUrl: fullSupportUrl,
                shortUrl: `${baseUrl}/${shortCode}`,
                downloadUrl: fullDownloadUrl,
                shortDownloadUrl: `${baseUrl}/${shortDownloadCode}`
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
        const clientIp = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
        console.log(`[SESSION-CREATE] Public web request from IP: ${clientIp}, User-Agent: ${req.headers['user-agent'] || 'unknown'}`);
        
        // Check for existing recent session from same IP (within last 5 minutes)
        const Session = require('../models/Session');
        try {
            const recentSessions = await Session.findByTechnician('public-web');
            const now = new Date();
            const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
            
            // Check if there's a very recent session (likely duplicate request)
            const veryRecent = recentSessions.find(s => {
                const createdAt = new Date(s.created_at);
                return createdAt > fiveMinutesAgo && s.status === 'waiting' && !s.device_id;
            });
            
            if (veryRecent) {
                console.log(`[SESSION-CREATE] Reusing recent session ${veryRecent.session_id} for IP ${clientIp} (prevented duplicate)`);
                const origin = process.env.SUPPORT_URL || `${req.protocol}://${req.get('host')}`;
                const directLink = `${origin}/support/${encodeURIComponent(veryRecent.session_id)}`;
                const downloadUrl = `${origin}/api/packages/download/${encodeURIComponent(veryRecent.session_id)}?type=zip`;
                
                const ttlDays = Math.max(1, Math.floor(Number(process.env.GENERATED_SESSION_TTL_DAYS || 20) || 20));
                const expiresInMinutes = ttlDays * 24 * 60;
                const urlShortener = require('../services/urlShortener');
                const shortCode = urlShortener.createShortUrl(directLink, expiresInMinutes);
                const shortDownloadCode = urlShortener.createShortUrl(downloadUrl, expiresInMinutes);
                const baseUrl = origin.replace(/\/remote.*$/, '');
                const shortLink = `${baseUrl}/${shortCode}`;
                const shortDownloadUrl = `${baseUrl}/${shortDownloadCode}`;
                
                return res.json({
                    success: true,
                    sessionId: veryRecent.session_id,
                    directLink,
                    shortLink,
                    downloadUrl,
                    shortDownloadUrl,
                    reused: true
                });
            }
        } catch (e) {
            console.warn('[SESSION-CREATE] Could not check for existing sessions:', e.message);
        }
        
        const ttlDays = Math.max(1, Math.floor(Number(process.env.GENERATED_SESSION_TTL_DAYS || 20) || 20));
        const expiresIn = ttlDays * 24 * 60 * 60;
        const session = await SessionService.createSession({
            technicianId: 'public-web',
            expiresIn
        });
        console.log(`[SESSION-CREATE] Created session ${session.session_id || session.sessionId} for public-web from IP ${clientIp}`);

        const sessionId = session.session_id || session.sessionId;
        if (!sessionId) {
            return res.status(500).json({ error: 'Session ID not found in session object' });
        }

        const origin = process.env.SUPPORT_URL || `${req.protocol}://${req.get('host')}`;
        const directLink = `${origin}/support/${encodeURIComponent(sessionId)}`;
        const downloadUrl = `${origin}/api/packages/download/${encodeURIComponent(sessionId)}?type=zip`;
        
        // Generate short URLs at root level (expires when session expires, default 20 days)
        const expiresInMinutes = ttlDays * 24 * 60;
        const shortCode = urlShortener.createShortUrl(directLink, expiresInMinutes);
        const shortDownloadCode = urlShortener.createShortUrl(downloadUrl, expiresInMinutes);
        const baseUrl = origin.replace(/\/remote.*$/, ''); // Remove /remote if present
        const shortLink = `${baseUrl}/${shortCode}`;
        const shortDownloadUrl = `${baseUrl}/${shortDownloadCode}`;

        const io = req.app.get('io');
        if (io) {
            io.emit('session-created', {
                sessionId,
                status: 'waiting',
                technician_id: null,
                created_at: new Date().toISOString(),
                link: directLink,
                shortLink,
                downloadUrl,
                shortDownloadUrl
            });
        }

        res.json({
            success: true,
            sessionId,
            directLink,
            shortLink,
            downloadUrl,
            shortDownloadUrl
        });
    } catch (error) {
        console.error('Error creating support session:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        if (!sessionId) {
            return res.status(400).json({ error: 'Missing sessionId' });
        }
        const session = await SessionService.getSession(sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Session not found or expired.' });
        }
        res.json({
            sessionId: session.session_id || session.sessionId,
            status: session.status,
            createdAt: session.created_at || session.createdAt,
            expiresAt: session.expires_at || session.expiresAt
        });
    } catch (error) {
        console.error('Error loading support session:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
