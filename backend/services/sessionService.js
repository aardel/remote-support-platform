const { v4: uuidv4 } = require('uuid');
const Session = require('../models/Session');
const PackageBuilder = require('./packageBuilder');

// In-memory storage for pending approvals (temporary)
const pendingApprovals = new Map();

class SessionService {
    static generateSessionId() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let id = '';
        for (let i = 0; i < 3; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        id += '-';
        for (let i = 0; i < 3; i++) {
            id += Math.floor(Math.random() * 10);
        }
        id += '-';
        for (let i = 0; i < 3; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return id;
    }
    
    static async createSession({ technicianId, expiresIn = 3600, deviceId = null }) {
        try {
            const session = await Session.create({ technicianId, expiresIn, deviceId });
            try {
                const builder = new PackageBuilder(process.env.SERVER_URL || 'http://localhost:3000');
                builder.ensureSessionBinaries(session.session_id || session.sessionId);
            } catch (error) {
                console.warn('Failed to ensure session binaries:', error.message);
            }
            return session;
        } catch (error) {
            // Fallback to in-memory if database not available
            console.warn('Database not available, using in-memory storage');
            return this.createSessionInMemory({ technicianId, expiresIn, deviceId });
        }
    }
    
    static async getSession(sessionId) {
        try {
            return await Session.findBySessionId(sessionId);
        } catch (error) {
            console.warn('Database error, using in-memory storage');
            return this.getSessionInMemory(sessionId);
        }
    }
    
    static async registerSession(sessionId, data) {
        try {
            return await Session.update(sessionId, {
                ...data,
                status: 'connected'
            });
        } catch (error) {
            console.warn('Database error, using in-memory storage');
            return this.registerSessionInMemory(sessionId, data);
        }
    }

    static async updateSession(sessionId, data) {
        try {
            return await Session.update(sessionId, data);
        } catch (error) {
            console.warn('Database error, using in-memory storage');
            return this.updateSessionInMemory(sessionId, data);
        }
    }
    
    // In-memory fallback methods
    static inMemorySessions = new Map();
    /** deviceId -> sessionId for "same device same session" in memory */
    static inMemoryDeviceToSession = new Map();

    static createSessionInMemory({ technicianId, expiresIn = 3600, deviceId = null }) {
        const sessionId = this.generateSessionId();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + expiresIn * 1000);

        const session = {
            id: uuidv4(),
            session_id: sessionId,
            technician_id: technicianId,
            device_id: deviceId,
            status: 'waiting',
            created_at: now,
            expires_at: expiresAt,
            allow_unattended: true,
            client_info: null,
            vnc_port: null,
            connected_at: null
        };

        this.inMemorySessions.set(sessionId, session);
        if (deviceId) {
            this.inMemoryDeviceToSession.set(deviceId, sessionId);
        }
        try {
            const builder = new PackageBuilder(process.env.SERVER_URL || 'http://localhost:3000');
            builder.ensureSessionBinaries(sessionId);
        } catch (error) {
            console.warn('Failed to ensure session binaries (memory):', error.message);
        }
        return session;
    }
    
    static getSessionInMemory(sessionId) {
        const session = this.inMemorySessions.get(sessionId);
        if (!session) return null;
        
        if (new Date() > new Date(session.expires_at)) {
            this.inMemorySessions.delete(sessionId);
            return null;
        }
        
        return session;
    }
    
    static registerSessionInMemory(sessionId, data) {
        const session = this.getSessionInMemory(sessionId);
        if (!session) throw new Error('Session not found');
        
        Object.assign(session, {
            ...data,
            status: 'connected'
        });
        
        this.inMemorySessions.set(sessionId, session);
        return session;
    }

    static updateSessionInMemory(sessionId, data) {
        const session = this.getSessionInMemory(sessionId);
        if (!session) throw new Error('Session not found');

        Object.assign(session, {
            ...data
        });

        this.inMemorySessions.set(sessionId, session);
        return session;
    }
    
    static async waitForApproval(sessionId, timeout = 30000) {
        return new Promise((resolve) => {
            const approval = {
                sessionId,
                status: 'pending',
                resolved: false
            };
            
            pendingApprovals.set(sessionId, approval);
            
            // Set timeout
            const timeoutId = setTimeout(() => {
                if (!approval.resolved) {
                    approval.resolved = true;
                    approval.status = 'timeout';
                    pendingApprovals.delete(sessionId);
                    resolve({ approved: false, reason: 'Timeout' });
                }
            }, timeout);
            
            // Check for response periodically
            const checkInterval = setInterval(() => {
                const currentApproval = pendingApprovals.get(sessionId);
                
                if (currentApproval && currentApproval.status === 'approved') {
                    clearTimeout(timeoutId);
                    clearInterval(checkInterval);
                    currentApproval.resolved = true;
                    pendingApprovals.delete(sessionId);
                    resolve({ approved: true });
                } else if (currentApproval && currentApproval.status === 'denied') {
                    clearTimeout(timeoutId);
                    clearInterval(checkInterval);
                    currentApproval.resolved = true;
                    pendingApprovals.delete(sessionId);
                    resolve({ approved: false, reason: 'Denied by user' });
                }
            }, 100);
        });
    }
    
    static async handleApprovalResponse(sessionId, approved) {
        const approval = pendingApprovals.get(sessionId);
        
        if (approval) {
            approval.status = approved ? 'approved' : 'denied';
            approval.respondedAt = new Date();
        }
    }
    
    /**
     * Assign a session for a device: return existing active session for this device,
     * or pending session from technician request, or create a new one.
     */
    static async assignSessionForDevice({ deviceId, deviceName, os, hostname, arch, allowUnattended, lastIp }) {
        const Device = require('../models/Device');
        const defaultTechnicianId = process.env.DEFAULT_TECHNICIAN_ID || 'system';

        try {
            // 1. Existing active session for this device (same user → same session)
            const existing = await Session.findActiveByDeviceId(deviceId);
            if (existing) {
                return {
                    sessionId: existing.session_id,
                    link: `${process.env.SERVER_URL || 'http://localhost:3000'}/support/${existing.session_id}`,
                    expiresAt: existing.expires_at,
                    existing: true
                };
            }

            // 2. Device has pending_session_id (technician sent "request session" for this device)
            const device = await Device.findByDeviceId(deviceId);
            if (device?.pending_session_id) {
                const pendingSession = await Session.findBySessionId(device.pending_session_id);
                if (pendingSession && new Date() < new Date(pendingSession.expires_at)) {
                    await Session.update(device.pending_session_id, { device_id: deviceId });
                    await Device.clearPendingSession(deviceId);
                    return {
                        sessionId: pendingSession.session_id,
                        link: `${process.env.SERVER_URL || 'http://localhost:3000'}/support/${pendingSession.session_id}`,
                        expiresAt: pendingSession.expires_at,
                        fromPending: true
                    };
                }
            }

            // 3. Create new session for this device
            const technicianId = device?.technician_id || defaultTechnicianId;
            const session = await Session.create({
                technicianId,
                expiresIn: 3600,
                deviceId
            });
            const sessionId = session.session_id;

            try {
                const builder = new PackageBuilder(process.env.SERVER_URL || 'http://localhost:3000');
                builder.ensureSessionBinaries(sessionId);
            } catch (e) {
                console.warn('Failed to ensure session binaries:', e.message);
            }

            await Device.upsert({
                deviceId,
                technicianId,
                displayName: deviceName,
                os,
                hostname,
                arch,
                allowUnattended,
                lastIp
            });

            return {
                sessionId,
                link: `${process.env.SERVER_URL || 'http://localhost:3000'}/support/${sessionId}`,
                expiresAt: session.expires_at,
                existing: false
            };
        } catch (error) {
            console.warn('assignSessionForDevice DB failed, using in-memory:', error.message);
            return this.assignSessionForDeviceInMemory({
                deviceId,
                deviceName,
                os,
                hostname,
                arch,
                allowUnattended
            });
        }
    }

    static assignSessionForDeviceInMemory({ deviceId, deviceName, os, hostname, arch, allowUnattended }) {
        const defaultTechnicianId = process.env.DEFAULT_TECHNICIAN_ID || 'system';
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 3600 * 1000);

        const existingSessionId = this.inMemoryDeviceToSession.get(deviceId);
        if (existingSessionId) {
            const session = this.inMemorySessions.get(existingSessionId);
            if (session && now < new Date(session.expires_at)) {
                return {
                    sessionId: session.session_id,
                    link: `${process.env.SERVER_URL || 'http://localhost:3000'}/support/${session.session_id}`,
                    expiresAt: session.expires_at,
                    existing: true
                };
            }
            this.inMemoryDeviceToSession.delete(deviceId);
        }

        const session = this.createSessionInMemory({
            technicianId: defaultTechnicianId,
            expiresIn: 3600,
            deviceId
        });
        return {
            sessionId: session.session_id,
            link: `${process.env.SERVER_URL || 'http://localhost:3000'}/support/${session.session_id}`,
            expiresAt: session.expires_at,
            existing: false
        };
    }

    static async cleanupExpiredSessions() {
        try {
            await Session.cleanupExpired();
        } catch (error) {
            // Fallback to in-memory cleanup
            const now = new Date();
            for (const [sessionId, session] of this.inMemorySessions.entries()) {
                if (now > new Date(session.expires_at)) {
                    this.inMemorySessions.delete(sessionId);
                    if (session.device_id) {
                        this.inMemoryDeviceToSession.delete(session.device_id);
                    }
                }
            }
        }
    }
    
    static generateSessionId() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let id = '';
        for (let i = 0; i < 3; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        id += '-';
        for (let i = 0; i < 3; i++) {
            id += Math.floor(Math.random() * 10);
        }
        id += '-';
        for (let i = 0; i < 3; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return id;
    }
}

module.exports = SessionService;
