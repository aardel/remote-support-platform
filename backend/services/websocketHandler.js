const { Server } = require('socket.io');
const SessionService = require('./sessionService');
const sessionStore = require('./sessionStore');

async function safeUpdateSession(sessionId, updates) {
    // Session schema can vary across deployments; tolerate missing columns by retrying without them.
    const data = { ...updates };
    // Try a few times in case multiple new columns are missing.
    for (let i = 0; i < 6; i++) {
        try {
            return await SessionService.updateSession(sessionId, data);
        } catch (e) {
            const msg = (e && e.message) ? String(e.message) : '';
            const m = msg.match(/column \"([^\"]+)\" of relation \"sessions\" does not exist/i);
            if (!m) throw e;
            const missing = m[1];
            if (missing in data) {
                delete data[missing];
                continue;
            }
            // If we cannot identify the offending key from the error, do not loop forever.
            throw e;
        }
    }
    return null;
}

class WebSocketHandler {
    constructor(server) {
        this.io = new Server(server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        // Track connections by session.
        // helper: single socketId
        // technicians: array of { socketId, technicianId, technicianName } (presence, not necessarily viewing)
        // viewingCounts: Map(technicianId -> number) for actual billable viewers (WebRTC connected)
        this.sessionConnections = new Map(); // sessionId -> { helper: socketId, technicians: [...], viewingCounts: Map }

        // Cache offers and ICE candidates for late-joining technicians
        this.pendingOffers = new Map(); // sessionId -> { offer, from, iceCandidates }

        this.vncBridge = null; // set via setVncBridge() after construction

        this.setupHandlers();
    }

    setupHandlers() {
        this.io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);

            const ensureConn = (sessionId) => {
                if (!this.sessionConnections.has(sessionId)) {
                    this.sessionConnections.set(sessionId, { helper: null, technicians: [], viewingCounts: new Map() });
                } else {
                    const c = this.sessionConnections.get(sessionId);
                    if (c && !c.viewingCounts) c.viewingCounts = new Map();
                }
                return this.sessionConnections.get(sessionId);
            };

            const countUniqueTechnicians = (conn) => {
                if (!conn || !Array.isArray(conn.technicians)) return 0;
                const ids = new Set(conn.technicians.map(t => t.technicianId || t.socketId).filter(Boolean));
                return ids.size;
            };

            const countViewingTechnicians = (conn) => {
                if (!conn || !conn.viewingCounts) return 0;
                return conn.viewingCounts.size;
            };

            const recomputeBillable = async (sessionId, conn, reason) => {
                // Best-effort: keep DB fields in sync if columns exist. If not, safeUpdateSession will drop them.
                const viewing = countViewingTechnicians(conn);
                try {
                    const session = await SessionService.getSession(sessionId);
                    if (!session) return;

                    const started = session.billable_started_at ? new Date(session.billable_started_at) : null;
                    const seconds = Number(session.billable_seconds || 0) || 0;

                    if (viewing > 0) {
                        if (!started) {
                            const now = new Date();
                            await safeUpdateSession(sessionId, { viewing_technicians: viewing, billable_started_at: now });
                            this.io.emit('session-updated', { sessionId, viewing_technicians: viewing, billable_started_at: now, billable_seconds: seconds, reason });
                        } else {
                            await safeUpdateSession(sessionId, { viewing_technicians: viewing });
                            this.io.emit('session-updated', { sessionId, viewing_technicians: viewing, billable_started_at: session.billable_started_at, billable_seconds: seconds, reason });
                        }
                        return;
                    }

                    // viewing === 0
                    if (started) {
                        const delta = Math.max(0, Math.floor((Date.now() - started.getTime()) / 1000));
                        const nextSeconds = seconds + delta;
                        await safeUpdateSession(sessionId, { viewing_technicians: 0, billable_started_at: null, billable_seconds: nextSeconds });
                        this.io.emit('session-updated', { sessionId, viewing_technicians: 0, billable_started_at: null, billable_seconds: nextSeconds, reason });
                    } else {
                        await safeUpdateSession(sessionId, { viewing_technicians: 0 }).catch(() => {});
                        this.io.emit('session-updated', { sessionId, viewing_technicians: 0, billable_started_at: null, billable_seconds: seconds, reason });
                    }
                } catch (_) {
                    // ignore
                }
            };

            const cleanupIfEmpty = (sessionId) => {
                const conn = this.sessionConnections.get(sessionId);
                if (!conn) return;
                const helperGone = !conn.helper;
                const techGone = !conn.technicians || conn.technicians.length === 0;
                if (helperGone && techGone) {
                    this.sessionConnections.delete(sessionId);
                    this.pendingOffers.delete(sessionId);
                    // Note: don't cleanup sessionStore here — XP clients may still
                    // be polling. sessionStore has its own 24h TTL expiry.
                }
            };

            // Join session room
            socket.on('join-session', (data) => {
                const { sessionId, role, technicianId, technicianName } = data;
                socket.join(`session-${sessionId}`);
                socket.sessionId = sessionId;
                socket.role = role || 'unknown';
                socket.technicianId = technicianId || socket.id;
                socket.technicianName = technicianName || 'Technician';

                // Track connection
                const conn = ensureConn(sessionId);
                if (role === 'helper') {
                    conn.helper = socket.id;
                    // Helper socket is the source of truth for "online/ready".
                    safeUpdateSession(sessionId, {
                        status: 'connected',
                        helper_connected: true,
                        active_technicians: countUniqueTechnicians(conn),
                        viewing_technicians: countViewingTechnicians(conn),
                        ended_at: null,
                        connected_at: new Date()
                    }).catch(e => {
                        console.error('Failed to update session status on helper join:', e.message);
                    });
                    this.io.emit('session-updated', {
                        sessionId,
                        status: 'connected',
                        helper_connected: true,
                        active_technicians: countUniqueTechnicians(conn),
                        viewing_technicians: countViewingTechnicians(conn)
                    });
                    // Send current technicians list to the helper so it can show who is already connected
                    if (conn.technicians.length > 0) {
                        socket.emit('technicians-present', {
                            sessionId,
                            technicians: conn.technicians.map(t => ({ technicianId: t.technicianId, technicianName: t.technicianName, technicianSocketId: t.socketId }))
                        });
                    }
                } else if (role === 'technician' || role === 'technician-panel') {
                    const techId = socket.technicianId;
                    const techName = socket.technicianName;
                    conn.technicians.push({ socketId: socket.id, technicianId: techId, technicianName: techName });
                    console.log(`Socket ${socket.id} joined session ${sessionId} as ${role} "${techName}"`);
                    safeUpdateSession(sessionId, {
                        active_technicians: countUniqueTechnicians(conn),
                        viewing_technicians: countViewingTechnicians(conn)
                    }).catch(() => {});
                    this.io.emit('session-updated', {
                        sessionId,
                        active_technicians: countUniqueTechnicians(conn),
                        viewing_technicians: countViewingTechnicians(conn)
                    });
                    // Notify helper (and others) so they can show who is connected
                    socket.to(`session-${sessionId}`).emit('technician-joined', { sessionId, technicianId: techId, technicianName: techName, technicianSocketId: socket.id });
                }

                // If technician joining, tell them whether helper is already online
                if (role === 'technician' || role === 'technician-panel') {
                    const helperOnline = !!conn.helper;
                    socket.emit('helper-status', { online: helperOnline, sessionId });
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

                // If no WebRTC offer but a VNC connection exists, notify technician to use noVNC
                if (role === 'technician' && !this.pendingOffers.has(sessionId) && this.vncBridge) {
                    const vncConn = this.vncBridge.getVNCConnection(sessionId);
                    if (vncConn && !vncConn.destroyed) {
                        console.log(`[VNC] Session ${sessionId} has active VNC connection, sending vnc-ready to technician`);
                        socket.emit('vnc-ready', { sessionId });
                    }
                }
            });

            // Billable presence: SessionView emits viewer-state=true only after WebRTC is actually connected.
            socket.on('viewer-state', (data) => {
                const sessionId = (data && data.sessionId) ? data.sessionId : socket.sessionId;
                if (!sessionId) return;
                const conn = ensureConn(sessionId);

                const techId = data?.technicianId || socket.technicianId || socket.id;
                const viewing = !!data?.viewing;

                const prev = countViewingTechnicians(conn);
                const counts = conn.viewingCounts;
                const cur = counts.get(techId) || 0;

                if (viewing) {
                    counts.set(techId, cur + 1);
                    socket.isViewer = true;
                    socket.viewerTechId = techId;
                    socket.viewerSessionId = sessionId;
                } else {
                    const next = Math.max(0, cur - 1);
                    if (next === 0) counts.delete(techId);
                    else counts.set(techId, next);
                    if (socket.viewerSessionId === sessionId && socket.viewerTechId === techId) {
                        socket.isViewer = false;
                        socket.viewerTechId = null;
                        socket.viewerSessionId = null;
                    }
                }

                const nowCount = countViewingTechnicians(conn);
                if (nowCount !== prev) {
                    recomputeBillable(sessionId, conn, 'viewer-state').catch(() => {});
                }
            });

            // Leave session room
            socket.on('leave-session', (data) => {
                const sessionId = (data && data.sessionId) ? data.sessionId : socket.sessionId;
                if (!sessionId) return;
                socket.leave(`session-${sessionId}`);
                console.log(`Socket ${socket.id} left session ${sessionId}`);

                const conn = this.sessionConnections.get(sessionId);
                if (conn) {
                    if (conn.helper === socket.id) {
                        conn.helper = null;
                        this.pendingOffers.delete(sessionId);
                        if (conn.viewingCounts) conn.viewingCounts.clear();
                        recomputeBillable(sessionId, conn, 'helper-left').catch(() => {});
                        safeUpdateSession(sessionId, {
                            status: 'waiting',
                            helper_connected: false,
                            active_technicians: countUniqueTechnicians(conn),
                            viewing_technicians: 0,
                            ended_at: new Date()
                        }).catch(() => {});
                        this.io.emit('session-updated', {
                            sessionId,
                            status: 'waiting',
                            helper_connected: false,
                            active_technicians: countUniqueTechnicians(conn),
                            viewing_technicians: 0
                        });
                        this.io.to(`session-${sessionId}`).emit('peer-disconnected', { role: 'helper', sessionId });
                    } else if (conn.technicians) {
                        // If this socket was counted as a viewer, decrement now.
                        if (socket.isViewer && socket.viewerSessionId === sessionId && socket.viewerTechId) {
                            const prev = countViewingTechnicians(conn);
                            const cur = conn.viewingCounts.get(socket.viewerTechId) || 0;
                            const next = Math.max(0, cur - 1);
                            if (next === 0) conn.viewingCounts.delete(socket.viewerTechId);
                            else conn.viewingCounts.set(socket.viewerTechId, next);
                            socket.isViewer = false;
                            socket.viewerTechId = null;
                            socket.viewerSessionId = null;
                            if (countViewingTechnicians(conn) !== prev) {
                                recomputeBillable(sessionId, conn, 'viewer-left').catch(() => {});
                            }
                        }

                        const idx = conn.technicians.findIndex(t => t.socketId === socket.id);
                        if (idx !== -1) {
                            const tech = conn.technicians[idx];
                            conn.technicians.splice(idx, 1);
                            if (conn.technicians.length === 0) {
                                this.pendingOffers.delete(sessionId);
                            }
                            safeUpdateSession(sessionId, { active_technicians: countUniqueTechnicians(conn) }).catch(() => {});
                            this.io.emit('session-updated', { sessionId, active_technicians: countUniqueTechnicians(conn), viewing_technicians: countViewingTechnicians(conn) });
                            this.io.to(`session-${sessionId}`).emit('technician-left', {
                                sessionId,
                                technicianId: tech.technicianId,
                                technicianName: tech.technicianName,
                                technicianSocketId: tech.socketId
                            });
                            this.io.to(`session-${sessionId}`).emit('peer-disconnected', { role: 'technician', sessionId });
                        }
                    }
                    cleanupIfEmpty(sessionId);
                }

                if (socket.sessionId === sessionId) {
                    socket.sessionId = null;
                    socket.role = 'unknown';
                }
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

            // Remote clipboard: technician sends clipboard text to paste on user PC
            socket.on('remote-clipboard', (data) => {
                const { sessionId } = data;
                socket.to(`session-${sessionId}`).emit('remote-clipboard', data);
            });

            // Remote control: Keyboard events from technician
            socket.on('remote-keyboard', (data) => {
                const { sessionId } = data;
                if (data.type === 'keydown') {
                    const room = this.io.sockets.adapter.rooms.get(`session-${sessionId}`);
                    const roomMembers = room ? [...room] : [];
                    const others = roomMembers.filter(id => id !== socket.id);
                    console.log(`[keyboard] forwarding "${data.key}" to session-${sessionId} | sender=${socket.id} | room members=${roomMembers.length} | targets=${others.length} (${others.join(', ')})`);
                }
                // Forward to helper
                socket.to(`session-${sessionId}`).emit('remote-keyboard', data);
            });

            // Monitor switch: technician requests different monitor
            socket.on('switch-monitor', (data) => {
                const { sessionId } = data;
                socket.to(`session-${sessionId}`).emit('switch-monitor', data);
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
                // If no helper connected (VNC-only session), store file server-side
                const conn = this.sessionConnections.get(sessionId);
                if (!conn || !conn.helper) {
                    try {
                        const fileRecord = sessionStore.addFileFromBase64(sessionId, {
                            filename: data.filename,
                            content: data.content
                        });
                        socket.emit('put-remote-file-result', {
                            sessionId,
                            requestId: data.requestId,
                            success: true,
                            stored: true,
                            fileId: fileRecord.id
                        });
                    } catch (err) {
                        socket.emit('put-remote-file-result', {
                            sessionId,
                            requestId: data.requestId,
                            error: err.message
                        });
                    }
                    return;
                }
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
            // Also store in sessionStore so HTTP-polling clients (XP) can retrieve them
            socket.on('chat-message', (data) => {
                const { sessionId } = data;
                const msg = { ...data, timestamp: data.timestamp || Date.now() };
                sessionStore.addMessage(sessionId, msg);
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
                        // If this socket was counted as a viewer, decrement now.
                        if (socket.isViewer && socket.viewerSessionId === socket.sessionId && socket.viewerTechId && conn.viewingCounts) {
                            const prev = countViewingTechnicians(conn);
                            const cur = conn.viewingCounts.get(socket.viewerTechId) || 0;
                            const next = Math.max(0, cur - 1);
                            if (next === 0) conn.viewingCounts.delete(socket.viewerTechId);
                            else conn.viewingCounts.set(socket.viewerTechId, next);
                            socket.isViewer = false;
                            socket.viewerTechId = null;
                            socket.viewerSessionId = null;
                            if (countViewingTechnicians(conn) !== prev) {
                                recomputeBillable(socket.sessionId, conn, 'viewer-disconnect').catch(() => {});
                            }
                        }

                        if (conn.helper === socket.id) {
                            conn.helper = null;
                            // Clear pending offer when helper disconnects
                            this.pendingOffers.delete(socket.sessionId);
                            if (conn.viewingCounts) conn.viewingCounts.clear();
                            recomputeBillable(socket.sessionId, conn, 'helper-disconnect').catch(() => {});
                            // Update session status to 'waiting' and record ended_at
                            safeUpdateSession(socket.sessionId, {
                                status: 'waiting',
                                helper_connected: false,
                                active_technicians: countUniqueTechnicians(conn),
                                viewing_technicians: 0,
                                ended_at: new Date()
                            }).catch(e => {
                                console.error('Failed to update session status on helper disconnect:', e.message);
                            });
                            this.io.emit('session-updated', {
                                sessionId: socket.sessionId,
                                status: 'waiting',
                                helper_connected: false,
                                active_technicians: countUniqueTechnicians(conn),
                                viewing_technicians: 0
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
                                // Clear cached offer so reconnecting technician gets a fresh one
                                if (conn.technicians.length === 0) {
                                    this.pendingOffers.delete(socket.sessionId);
                                }
                                safeUpdateSession(socket.sessionId, {
                                    active_technicians: countUniqueTechnicians(conn),
                                    viewing_technicians: countViewingTechnicians(conn)
                                }).catch(() => {});
                                this.io.emit('session-updated', {
                                    sessionId: socket.sessionId,
                                    active_technicians: countUniqueTechnicians(conn),
                                    viewing_technicians: countViewingTechnicians(conn)
                                });
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
                        cleanupIfEmpty(socket.sessionId);
                    }
                }
            });
        });
    }

    setVncBridge(bridge) {
        this.vncBridge = bridge;
    }

    getIO() {
        return this.io;
    }
}

module.exports = WebSocketHandler;
