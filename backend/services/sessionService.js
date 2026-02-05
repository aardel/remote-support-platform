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
    
    static async createSession({ technicianId, expiresIn = 3600 }) {
        try {
            const session = await Session.create({ technicianId, expiresIn });
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
            return this.createSessionInMemory({ technicianId, expiresIn });
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
    
    static createSessionInMemory({ technicianId, expiresIn = 3600 }) {
        const sessionId = this.generateSessionId();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + expiresIn * 1000);
        
        const session = {
            id: uuidv4(),
            session_id: sessionId,
            technician_id: technicianId,
            status: 'waiting',
            created_at: now,
            expires_at: expiresAt,
            allow_unattended: true,
            client_info: null,
            vnc_port: null,
            connected_at: null
        };
        
        this.inMemorySessions.set(sessionId, session);
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
    
    static async cleanupExpiredSessions() {
        try {
            await Session.cleanupExpired();
        } catch (error) {
            // Fallback to in-memory cleanup
            const now = new Date();
            for (const [sessionId, session] of this.inMemorySessions.entries()) {
                if (now > new Date(session.expires_at)) {
                    this.inMemorySessions.delete(sessionId);
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
