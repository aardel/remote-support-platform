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

        // Cache offers and ICE candidates for late-joining technicians
        this.pendingOffers = new Map(); // sessionId -> { offer, from, iceCandidates }

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

                // If technician joins and there's a pending offer, send it
                if (role === 'technician' && this.pendingOffers.has(sessionId)) {
                    const pending = this.pendingOffers.get(sessionId);
                    console.log(`Sending cached offer to technician for session ${sessionId}`);
                    socket.emit('webrtc-offer', {
                        sessionId,
                        offer: pending.offer,
                        from: pending.from
                    });
                    // Also send any cached ICE candidates
                    if (pending.iceCandidates && pending.iceCandidates.length > 0) {
                        console.log(`Sending ${pending.iceCandidates.length} cached ICE candidates to technician`);
                        pending.iceCandidates.forEach(ice => {
                            socket.emit('webrtc-ice-candidate', ice);
                        });
                    }
                }
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

                // Cache the offer for late-joining technicians
                this.pendingOffers.set(sessionId, {
                    offer,
                    from: socket.id,
                    iceCandidates: []
                });

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

                // Cache ICE candidates from helper if technician hasn't joined yet
                if (role === 'helper' && this.pendingOffers.has(sessionId)) {
                    const pending = this.pendingOffers.get(sessionId);
                    const conn = this.sessionConnections.get(sessionId);
                    if (!conn || !conn.technician) {
                        pending.iceCandidates.push({
                            sessionId,
                            candidate,
                            from: socket.id,
                            role
                        });
                    }
                }

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
                            // Clear pending offer when helper disconnects
                            this.pendingOffers.delete(socket.sessionId);
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
