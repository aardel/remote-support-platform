const net = require('net');
const WebSocket = require('ws');
const sessionMapper = require('../utils/sessionMapper');
const SessionService = require('./sessionService');

class VNCBridge {
    constructor(httpServer) {
        this.vncConnections = new Map(); // sessionId -> VNC connection
        this.wsConnections = new Map(); // sessionId -> WebSocket connection
        this.vncBuffers = new Map(); // sessionId -> Buffer[] — buffer VNC data until WebSocket connects
        this.pendingByIp = new Map(); // ip -> { sessionId, ts }
        this.pendingBySession = new Map(); // sessionId -> { ip, ts } — fallback when IP doesn't match (proxy/NAT)
        this.vncListener = null;
        this.wss = null;
        this.httpServer = httpServer || null;
        this.io = null;
    }

    setIo(io) {
        this.io = io;
    }

    start() {
        // Start VNC listener (for reverse connections)
        this.startVNCListener();
        
        // Start WebSocket server (for noVNC clients)
        this.startWebSocketServer();
        
        console.log('✅ VNC Bridge started');
        console.log(`   VNC Listener: Port ${process.env.VNC_LISTENER_PORT || 5500}`);
        console.log(`   WebSocket Server: Port ${process.env.WEBSOCKET_PORT || 6080}`);
    }
    
    startVNCListener() {
        const port = process.env.VNC_LISTENER_PORT || 5500;
        
        this.vncListener = net.createServer((vncSocket) => {
            const remoteIp = this.normalizeIp(vncSocket.remoteAddress);
            console.log(`📡 Incoming VNC connection from ${remoteIp || vncSocket.remoteAddress}:${vncSocket.remotePort}`);

            this.handleVncConnection(vncSocket, remoteIp).catch(err => {
                console.error(`[VNC] Error handling connection from ${remoteIp}:`, err.message);
                if (!vncSocket.destroyed) vncSocket.end();
            });
        });

        this.vncListener.listen(port, () => {
            console.log(`✅ VNC listener started on port ${port}`);
        });
    }

    async handleVncConnection(vncSocket, remoteIp) {
            let sessionId = this.extractSessionIdFromConnection(vncSocket);

            // Auto-create session for unmapped VNC connections (e.g. XP clients
            // that can't reach the HTTPS registration endpoint).
            // But first check if this IP already has an active VNC connection
            // (e.g. TightVNC reconnecting) — reuse that session instead.
            if (!sessionId) {
                for (const [existingSessionId, existingSocket] of this.vncConnections) {
                    const existingIp = this.normalizeIp(existingSocket.remoteAddress);
                    if (existingIp === remoteIp) {
                        console.log(`[VNC] IP ${remoteIp} already has session ${existingSessionId}, replacing VNC socket`);
                        // Close old socket, reuse the session
                        if (!existingSocket.destroyed) existingSocket.destroy();
                        sessionId = existingSessionId;
                        break;
                    }
                }
            }
            if (!sessionId) {
                console.log(`[VNC] No mapping for ${remoteIp}, auto-creating session...`);
                try {
                    const session = await SessionService.createSession({
                        technicianId: 'vnc-auto',
                        expiresIn: 20 * 24 * 60 * 60
                    });
                    sessionId = session.session_id || session.sessionId;
                    const serverUrl = process.env.SUPPORT_URL || process.env.SERVER_URL || 'http://localhost:3000';
                    const directLink = `${serverUrl}/support/${sessionId}`;
                    const downloadUrl = `${serverUrl}/api/packages/download/${sessionId}`;
                    
                    // Generate short URLs (expires when session expires, default 20 days)
                    const urlShortener = require('./urlShortener');
                    const expiresInMinutes = 20 * 24 * 60;
                    const shortCode = urlShortener.createShortUrl(directLink, expiresInMinutes);
                    const shortDownloadCode = urlShortener.createShortUrl(downloadUrl, expiresInMinutes);
                    const shortLink = `${serverUrl}/s/${shortCode}`;
                    const shortDownloadUrl = `${serverUrl}/s/${shortDownloadCode}`;
                    
                    // Update session status directly (registerSession may fail on in-memory fallback)
                    try {
                        await SessionService.registerSession(sessionId, {
                            clientInfo: { os: 'Unknown (VNC)', hostname: remoteIp, arch: 'unknown' },
                            vncPort: 5900,
                            status: 'connected'
                        });
                    } catch (_) {
                        // In-memory fallback: session was already created, just continue
                    }
                    console.log(`[VNC] Auto-created session ${sessionId} for ${remoteIp}`);
                    // Notify dashboards
                    if (this.io) {
                        this.io.emit('session-created', {
                            sessionId,
                            session_id: sessionId,
                            status: 'connected',
                            technician_id: 'vnc-auto',
                            created_at: new Date().toISOString(),
                            link: directLink,
                            shortLink,
                            downloadUrl,
                            shortDownloadUrl,
                            client_info: { os: 'Unknown (VNC)', hostname: remoteIp },
                            helper_connected: true
                        });
                    }
                } catch (err) {
                    console.error(`[VNC] Failed to auto-create session for ${remoteIp}:`, err.message);
                    vncSocket.end();
                    return;
                }
            }
            
            console.log(`📡 VNC connection received for session: ${sessionId}`);

            // Store VNC connection
            this.vncConnections.set(sessionId, vncSocket);

            // Notify technicians that VNC is ready (so SessionView can switch to noVNC mode)
            if (this.io) {
                this.io.to(`session-${sessionId}`).emit('vnc-ready', { sessionId });
                // Also update session status
                this.io.emit('session-updated', {
                    sessionId,
                    status: 'connected',
                    helper_connected: true,
                    vnc_connected: true
                });
            }

            // If WebSocket (noVNC viewer) is already connected, bridge them
            const ws = this.wsConnections.get(sessionId);
            if (ws && ws.readyState === WebSocket.OPEN) {
                this.bridgeConnections(sessionId, vncSocket, ws);
            }

            // VNC → WebSocket forwarding; buffer data if WebSocket isn't connected yet
            this.vncBuffers.set(sessionId, []);
            vncSocket.on('data', (data) => {
                const ws = this.wsConnections.get(sessionId);
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(data);
                } else {
                    // Buffer until WebSocket connects (e.g. RFB version string)
                    const buf = this.vncBuffers.get(sessionId);
                    if (buf) buf.push(Buffer.from(data));
                }
            });

            vncSocket.on('close', () => {
                console.log(`🔌 VNC connection closed for session: ${sessionId}`);
                this.vncConnections.delete(sessionId);
                this.vncBuffers.delete(sessionId);

                // Notify WebSocket client and technicians
                const ws = this.wsConnections.get(sessionId);
                if (ws) {
                    ws.close();
                }
                if (this.io) {
                    this.io.to(`session-${sessionId}`).emit('vnc-disconnected', { sessionId });
                    // Update session status so dashboard shows offline
                    this.io.emit('session-updated', {
                        sessionId,
                        status: 'waiting',
                        helper_connected: false,
                        vnc_connected: false
                    });
                }

                // Update database
                SessionService.updateSession(sessionId, {
                    status: 'waiting',
                    helper_connected: false,
                    ended_at: new Date()
                }).catch(() => {});
            });

            vncSocket.on('error', (error) => {
                console.error(`❌ VNC socket error for session ${sessionId}:`, error.message);
                // Error will be followed by 'close' event, which handles cleanup
            });
    }
    
    startWebSocketServer() {
        if (this.httpServer) {
            this.wss = new WebSocket.Server({ noServer: true });

            this.httpServer.on('upgrade', (req, socket, head) => {
                if (!req.url || !req.url.startsWith('/websockify')) {
                    return;
                }

                this.wss.handleUpgrade(req, socket, head, (ws) => {
                    this.wss.emit('connection', ws, req);
                });
            });

            console.log('✅ WebSocket server attached at /websockify');
        } else {
            const port = process.env.WEBSOCKET_PORT || 6080;
            this.wss = new WebSocket.Server({ port });
            console.log(`✅ WebSocket server started on port ${port}`);
        }

        // Connection handler — shared between noServer and standalone modes
        this.wss.on('connection', (ws, req) => {
            // Extract session ID from URL
            const url = new URL(req.url, `http://${req.headers.host}`);
            const sessionId = url.searchParams.get('session') ||
                            url.pathname.split('/').pop();

            if (!sessionId) {
                console.warn('No session ID in WebSocket connection');
                ws.close(1008, 'Session ID required');
                return;
            }

            console.log(`🌐 WebSocket connection for session: ${sessionId}`);

            // Store WebSocket connection
            this.wsConnections.set(sessionId, ws);

            // If VNC is already connected, bridge them
            const vncSocket = this.vncConnections.get(sessionId);
            if (vncSocket && !vncSocket.destroyed) {
                console.log(`🔗 VNC already connected for ${sessionId}, bridging immediately`);
                // Flush any buffered VNC data (e.g. RFB version string sent before WS connected)
                const buf = this.vncBuffers.get(sessionId);
                if (buf && buf.length > 0) {
                    console.log(`📦 Flushing ${buf.length} buffered VNC packets to WebSocket`);
                    for (const chunk of buf) {
                        ws.send(chunk);
                    }
                    buf.length = 0;
                }
                this.vncBuffers.delete(sessionId);
                this.bridgeConnections(sessionId, vncSocket, ws);
            }

            // Handle WebSocket messages (technician → VNC)
            ws.on('message', (data) => {
                const vncSocket = this.vncConnections.get(sessionId);
                if (vncSocket && !vncSocket.destroyed) {
                    vncSocket.write(data);
                }
            });

            ws.on('close', () => {
                console.log(`🔌 WebSocket closed for session: ${sessionId}`);
                this.wsConnections.delete(sessionId);
            });

            ws.on('error', (error) => {
                console.error(`❌ WebSocket error for session ${sessionId}:`, error);
            });
        });
    }
    
    bridgeConnections(sessionId, vncSocket, ws) {
        console.log(`🔗 Bridging connections for session: ${sessionId}`);
        // Data forwarding is handled by the inline handlers in handleVncConnection
        // (VNC→WS) and startWebSocketServer (WS→VNC). This method just logs the bridge.
    }
    
    extractSessionIdFromConnection(socket) {
        const ip = this.normalizeIp(socket.remoteAddress);
        const now = Date.now();
        const ttlMs = 10 * 60 * 1000; // 10 minutes

        // 1. Try exact IP match from registration
        const pending = ip ? this.pendingByIp.get(ip) : null;
        console.log(`[VNC-LOOKUP] Incoming IP: raw=${socket.remoteAddress}, normalized=${ip}, pendingByIp keys: [${[...this.pendingByIp.keys()].join(', ')}], pendingBySession keys: [${[...this.pendingBySession.keys()].join(', ')}], match: ${pending ? pending.sessionId : 'none'}`);
        if (pending && now - pending.ts <= ttlMs) {
            this.pendingByIp.delete(ip);
            this.pendingBySession.delete(pending.sessionId);
            return pending.sessionId;
        }

        // 2. Fallback: if only one session is pending (proxy/NAT may change the IP),
        //    match the VNC connection to it. This handles the common case where a
        //    reverse proxy (nginx/Docker) makes the registration IP differ from the
        //    raw TCP VNC connection IP.
        const recentPending = [];
        for (const [sessionId, entry] of this.pendingBySession) {
            if (now - entry.ts <= ttlMs && !this.vncConnections.has(sessionId)) {
                recentPending.push(sessionId);
            } else if (now - entry.ts > ttlMs) {
                this.pendingBySession.delete(sessionId);
            }
        }
        if (recentPending.length === 1) {
            const sessionId = recentPending[0];
            console.log(`[VNC-LOOKUP] IP mismatch but only one pending session, matching to: ${sessionId}`);
            this.pendingBySession.delete(sessionId);
            // Clean up the IP entry too
            for (const [k, v] of this.pendingByIp) {
                if (v.sessionId === sessionId) { this.pendingByIp.delete(k); break; }
            }
            return sessionId;
        }

        // 3. Legacy fallback
        const connectionId = `${socket.remoteAddress}:${socket.remotePort}`;
        return sessionMapper.getSessionId(connectionId);
    }
    
    setSessionMapping(sessionId, vncSocket) {
        const connectionId = `${vncSocket.remoteAddress}:${vncSocket.remotePort}`;
        sessionMapper.registerConnection(sessionId, connectionId);
        this.vncConnections.set(sessionId, vncSocket);
    }
    
    // Map session to VNC connection when user registers
    mapSessionToConnection(sessionId, connectionInfo) {
        const ts = Date.now();
        const ip = this.normalizeIp(connectionInfo?.clientIp);
        // Always store by session ID (fallback for proxy/NAT IP mismatch)
        this.pendingBySession.set(sessionId, { ip, ts });
        if (ip) {
            this.pendingByIp.set(ip, { sessionId, ts });
            console.log(`[VNC-MAP] Session ${sessionId} mapped to IP ${ip}, waiting for VNC connection`);
        } else {
            console.log(`[VNC-MAP] Session ${sessionId} mapped (no client IP), waiting for VNC connection`);
        }
    }

    normalizeIp(ip) {
        if (!ip) return null;
        // Strip IPv6 mapped IPv4 prefix
        if (ip.startsWith('::ffff:')) return ip.slice(7);
        return ip;
    }
    
    getVNCConnection(sessionId) {
        return this.vncConnections.get(sessionId);
    }
    
    getWebSocketConnection(sessionId) {
        return this.wsConnections.get(sessionId);
    }
}

module.exports = VNCBridge;
