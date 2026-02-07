const { Server } = require('socket.io');
const Session = require('../models/Session');

class WebSocketHandler {
    constructor(server) {
        this.io = new Server(server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        // Track connections by session: helper = single socketId; technicians = array of { socketId, technicianId, technicianName }
        this.sessionConnections = new Map(); // sessionId -> { helper: socketId, technicians: [...] }

        // Cache offers and ICE candidates for late-joining technicians
        this.pendingOffers = new Map(); // sessionId -> { offer, from, iceCandidates }

        this.setupHandlers();
    }

    setupHandlers() {
        this.io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);

            // Join session room
            socket.on('join-session', (data) => {
                const { sessionId, role, technicianId, technicianName } = data;
                socket.join(`session-${sessionId}`);
                socket.sessionId = sessionId;
                socket.role = role || 'unknown';

                // Track connection
                if (!this.sessionConnections.has(sessionId)) {
                    this.sessionConnections.set(sessionId, { helper: null, technicians: [] });
                }
                const conn = this.sessionConnections.get(sessionId);
                if (role === 'helper') {
                    conn.helper = socket.id;
                    // Send current technicians list to the helper so it can show who is already connected
                    if (conn.technicians.length > 0) {
                        socket.emit('technicians-present', {
                            sessionId,
                            technicians: conn.technicians.map(t => ({ technicianId: t.technicianId, technicianName: t.technicianName, technicianSocketId: t.socketId }))
                        });
                    }
                } else if (role === 'technician') {
                    const techId = technicianId || socket.id;
                    const techName = technicianName || 'Technician';
                    conn.technicians.push({ socketId: socket.id, technicianId: techId, technicianName: techName });
                    console.log(`Socket ${socket.id} joined session ${sessionId} as technician "${techName}"`);
                    // Notify helper (and others) so they can show who is connected
                    socket.to(`session-${sessionId}`).emit('technician-joined', { sessionId, technicianId: techId, technicianName: techName, technicianSocketId: socket.id });
                }

                // Notify others in the session (legacy)
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

                // Forward to technician(s): if targetSocketId set, send only to that socket (multi-viewer); else broadcast to room
                const payload = { sessionId, offer, from: socket.id };
                if (data.targetSocketId) {
                    this.io.to(data.targetSocketId).emit('webrtc-offer', payload);
                } else {
                    socket.to(`session-${sessionId}`).emit('webrtc-offer', payload);
                }
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

                // Cache ICE candidates from helper if no technician has joined yet
                if (role === 'helper' && this.pendingOffers.has(sessionId)) {
                    const pending = this.pendingOffers.get(sessionId);
                    const conn = this.sessionConnections.get(sessionId);
                    if (!conn || !conn.technicians || conn.technicians.length === 0) {
                        pending.iceCandidates.push({
                            sessionId,
                            candidate,
                            from: socket.id,
                            role
                        });
                    }
                }

                // Forward to other peer(s): if targetSocketId set (helper sending to one technician), send only to that socket
                const icePayload = { sessionId, candidate, from: socket.id, role };
                if (data.targetSocketId) {
                    this.io.to(data.targetSocketId).emit('webrtc-ice-candidate', icePayload);
                } else {
                    socket.to(`session-${sessionId}`).emit('webrtc-ice-candidate', icePayload);
                }
            });

            // Helper capabilities: forward to technician so they see control status
            socket.on('helper-capabilities', (data) => {
                const { sessionId } = data;
                console.log(`Helper capabilities for session ${sessionId}:`, JSON.stringify(data.capabilities));
                socket.to(`session-${sessionId}`).emit('helper-capabilities', data);
            });

            // Remote control: Mouse events from technician
            socket.on('remote-mouse', (data) => {
                const { sessionId } = data;
                if (data.type === 'mousedown') console.log(`[mouse] forwarding ${data.type} to session-${sessionId} x=${data.x?.toFixed(3)} y=${data.y?.toFixed(3)}`);
                // Forward to helper
                socket.to(`session-${sessionId}`).emit('remote-mouse', data);
            });

            // Remote control: Keyboard events from technician
            socket.on('remote-keyboard', (data) => {
                const { sessionId } = data;
                // Forward to helper
                socket.to(`session-${sessionId}`).emit('remote-keyboard', data);
            });

            // Stream quality: technician chooses quality/speed preset
            socket.on('set-stream-quality', (data) => {
                const { sessionId } = data;
                socket.to(`session-${sessionId}`).emit('set-stream-quality', data);
            });

            // Remote file browser: technician -> helper (forward to session room)
            socket.on('list-remote-dir', (data) => {
                const { sessionId } = data;
                socket.to(`session-${sessionId}`).emit('list-remote-dir', data);
            });
            socket.on('get-remote-file', (data) => {
                const { sessionId } = data;
                socket.to(`session-${sessionId}`).emit('get-remote-file', data);
            });
            socket.on('put-remote-file', (data) => {
                const { sessionId } = data;
                socket.to(`session-${sessionId}`).emit('put-remote-file', data);
            });

            // Remote file browser: helper -> technician (forward result to room excluding sender)
            socket.on('list-remote-dir-result', (data) => {
                const { sessionId } = data;
                socket.to(`session-${sessionId}`).emit('list-remote-dir-result', data);
            });
            socket.on('get-remote-file-result', (data) => {
                const { sessionId } = data;
                socket.to(`session-${sessionId}`).emit('get-remote-file-result', data);
            });
            socket.on('put-remote-file-result', (data) => {
                const { sessionId } = data;
                socket.to(`session-${sessionId}`).emit('put-remote-file-result', data);
            });

            // Chat messages: forward to session room with timestamp
            socket.on('chat-message', (data) => {
                const { sessionId } = data;
                const msg = { ...data, timestamp: data.timestamp || Date.now() };
                socket.to(`session-${sessionId}`).emit('chat-message', msg);
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
                            // Update session status to 'waiting' in DB and broadcast
                            Session.update(socket.sessionId, { status: 'waiting' }).catch(e => {
                                console.error('Failed to update session status on helper disconnect:', e.message);
                            });
                            this.io.emit('session-updated', {
                                sessionId: socket.sessionId,
                                status: 'waiting'
                            });
                            // Notify technicians that helper disconnected
                            this.io.to(`session-${socket.sessionId}`).emit('peer-disconnected', {
                                role: 'helper',
                                sessionId: socket.sessionId
                            });
                        } else if (conn.technicians) {
                            const idx = conn.technicians.findIndex(t => t.socketId === socket.id);
                            if (idx !== -1) {
                                const tech = conn.technicians[idx];
                                conn.technicians.splice(idx, 1);
                                // Notify helper (and others) so they can update the "who is connected" list
                                this.io.to(`session-${socket.sessionId}`).emit('technician-left', {
                                    sessionId: socket.sessionId,
                                    technicianId: tech.technicianId,
                                    technicianName: tech.technicianName,
                                    technicianSocketId: tech.socketId
                                });
                                // Legacy: notify helper that a technician disconnected
                                this.io.to(`session-${socket.sessionId}`).emit('peer-disconnected', {
                                    role: 'technician',
                                    sessionId: socket.sessionId
                                });
                            }
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
