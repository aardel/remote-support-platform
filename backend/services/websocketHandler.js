const { Server } = require('socket.io');

class WebSocketHandler {
    constructor(server) {
        this.io = new Server(server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        // Track connections by session
        this.sessionConnections = new Map(); // sessionId -> { helper: socketId, technician: socketId }

        this.setupHandlers();
    }

    setupHandlers() {
        this.io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);

            // Join session room
            socket.on('join-session', (data) => {
                const { sessionId, role } = data;
                socket.join(`session-${sessionId}`);
                socket.sessionId = sessionId;
                socket.role = role || 'unknown';

                // Track connection
                if (!this.sessionConnections.has(sessionId)) {
                    this.sessionConnections.set(sessionId, {});
                }
                const conn = this.sessionConnections.get(sessionId);
                if (role === 'helper') {
                    conn.helper = socket.id;
                } else if (role === 'technician') {
                    conn.technician = socket.id;
                }

                console.log(`Socket ${socket.id} joined session ${sessionId} as ${role}`);

                // Notify others in the session
                socket.to(`session-${sessionId}`).emit('peer-joined', { role, sessionId });
            });

            // Leave session room
            socket.on('leave-session', (data) => {
                const { sessionId } = data;
                socket.leave(`session-${sessionId}`);
                console.log(`Socket ${socket.id} left session ${sessionId}`);
            });

            // WebRTC Signaling: Offer from helper
            socket.on('webrtc-offer', (data) => {
                const { sessionId, offer } = data;
                console.log(`WebRTC offer received for session ${sessionId}`);
                // Forward to technician(s) in the session
                socket.to(`session-${sessionId}`).emit('webrtc-offer', {
                    sessionId,
                    offer,
                    from: socket.id
                });
            });

            // WebRTC Signaling: Answer from technician
            socket.on('webrtc-answer', (data) => {
                const { sessionId, answer } = data;
                console.log(`WebRTC answer received for session ${sessionId}`);
                // Forward to helper in the session
                socket.to(`session-${sessionId}`).emit('webrtc-answer', {
                    sessionId,
                    answer,
                    from: socket.id
                });
            });

            // WebRTC Signaling: ICE candidates
            socket.on('webrtc-ice-candidate', (data) => {
                const { sessionId, candidate, role } = data;
                console.log(`ICE candidate from ${role} for session ${sessionId}`);
                // Forward to other peer in the session
                socket.to(`session-${sessionId}`).emit('webrtc-ice-candidate', {
                    sessionId,
                    candidate,
                    from: socket.id,
                    role
                });
            });

            // Remote control: Mouse events from technician
            socket.on('remote-mouse', (data) => {
                const { sessionId } = data;
                // Forward to helper
                socket.to(`session-${sessionId}`).emit('remote-mouse', data);
            });

            // Remote control: Keyboard events from technician
            socket.on('remote-keyboard', (data) => {
                const { sessionId } = data;
                // Forward to helper
                socket.to(`session-${sessionId}`).emit('remote-keyboard', data);
            });

            // Handle approval responses
            socket.on('approval-response', (data) => {
                const { sessionId, approved } = data;
                console.log(`Approval response for ${sessionId}: ${approved ? 'approved' : 'denied'}`);
            });

            socket.on('disconnect', () => {
                console.log('Client disconnected:', socket.id);

                // Clean up session connection tracking
                if (socket.sessionId) {
                    const conn = this.sessionConnections.get(socket.sessionId);
                    if (conn) {
                        if (conn.helper === socket.id) {
                            conn.helper = null;
                            // Notify technician that helper disconnected
                            this.io.to(`session-${socket.sessionId}`).emit('peer-disconnected', {
                                role: 'helper',
                                sessionId: socket.sessionId
                            });
                        } else if (conn.technician === socket.id) {
                            conn.technician = null;
                            // Notify helper that technician disconnected
                            this.io.to(`session-${socket.sessionId}`).emit('peer-disconnected', {
                                role: 'technician',
                                sessionId: socket.sessionId
                            });
                        }
                    }
                }
            });
        });
    }

    getIO() {
        return this.io;
    }
}

module.exports = WebSocketHandler;
