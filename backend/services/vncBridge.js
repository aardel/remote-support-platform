const net = require('net');
const WebSocket = require('ws');
const sessionMapper = require('../utils/sessionMapper');

class VNCBridge {
    constructor(httpServer) {
        this.vncConnections = new Map(); // sessionId -> VNC connection
        this.wsConnections = new Map(); // sessionId -> WebSocket connection
        this.vncListener = null;
        this.wss = null;
        this.httpServer = httpServer || null;
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
            const sessionId = this.extractSessionIdFromConnection(vncSocket);
            
            if (!sessionId) {
                console.warn('No session ID found, closing connection');
                vncSocket.end();
                return;
            }
            
            console.log(`📡 VNC connection received for session: ${sessionId}`);
            
            // Store VNC connection
            this.vncConnections.set(sessionId, vncSocket);
            
            // If WebSocket is already connected, bridge them
            const ws = this.wsConnections.get(sessionId);
            if (ws && ws.readyState === WebSocket.OPEN) {
                this.bridgeConnections(sessionId, vncSocket, ws);
            }
            
            // Handle VNC socket events
            vncSocket.on('data', (data) => {
                const ws = this.wsConnections.get(sessionId);
                if (ws && ws.readyState === WebSocket.OPEN) {
                    // Forward VNC data to WebSocket (noVNC)
                    ws.send(data);
                }
            });
            
            vncSocket.on('close', () => {
                console.log(`🔌 VNC connection closed for session: ${sessionId}`);
                this.vncConnections.delete(sessionId);
                
                // Notify WebSocket client
                const ws = this.wsConnections.get(sessionId);
                if (ws) {
                    ws.close();
                }
            });
            
            vncSocket.on('error', (error) => {
                console.error(`❌ VNC socket error for session ${sessionId}:`, error);
            });
        });
        
        this.vncListener.listen(port, '0.0.0.0', () => {
            console.log(`✅ VNC listener started on port ${port}`);
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
            return;
        }

        const port = process.env.WEBSOCKET_PORT || 6080;

        this.wss = new WebSocket.Server({ port });
        
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
                this.bridgeConnections(sessionId, vncSocket, ws);
            }
            
            // Handle WebSocket messages
            ws.on('message', (data) => {
                const vncSocket = this.vncConnections.get(sessionId);
                if (vncSocket && !vncSocket.destroyed) {
                    // Forward WebSocket data to VNC
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
        
        console.log(`✅ WebSocket server started on port ${port}`);
    }
    
    bridgeConnections(sessionId, vncSocket, ws) {
        console.log(`🔗 Bridging connections for session: ${sessionId}`);
        
        // VNC → WebSocket
        vncSocket.on('data', (data) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        });
        
        // WebSocket → VNC
        ws.on('message', (data) => {
            if (!vncSocket.destroyed) {
                vncSocket.write(data);
            }
        });
    }
    
    extractSessionIdFromConnection(socket) {
        // Try to get session ID from connection metadata
        // In production, you might send session ID in initial handshake
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
        // When user registers, we store the mapping
        // When VNC reverse connection arrives, we match it to the session
        // This is a simplified approach - in production, you'd use a more robust method
        console.log(`Session ${sessionId} mapped, waiting for VNC connection`);
    }
    
    getVNCConnection(sessionId) {
        return this.vncConnections.get(sessionId);
    }
    
    getWebSocketConnection(sessionId) {
        return this.wsConnections.get(sessionId);
    }
}

module.exports = VNCBridge;
