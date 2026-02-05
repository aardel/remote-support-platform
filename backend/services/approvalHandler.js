// Handles connection approval requests
class ApprovalHandler {
    constructor(io) {
        this.io = io;
        this.pendingApprovals = new Map();
    }
    
    async requestConnectionApproval(sessionId, technicianInfo) {
        // Check if unattended is allowed (from session)
        const SessionService = require('./sessionService');
        const session = await SessionService.getSession(sessionId);
        
        if (!session) {
            throw new Error('Session not found');
        }
        
        const allowUnattended = session.allow_unattended !== false;
        
        if (allowUnattended) {
            return { approved: true, autoApproved: true };
        }
        
        // Require manual approval
        this.pendingApprovals.set(sessionId, {
            technicianInfo,
            requestedAt: new Date(),
            status: 'pending'
        });
        
        // Send approval request to client
        this.sendApprovalRequest(sessionId, technicianInfo);
        
        // Wait for approval
        return this.waitForApproval(sessionId, 30000);
    }
    
    sendApprovalRequest(sessionId, technicianInfo) {
        // Send to all sockets in session room
        this.io.to(`session-${sessionId}`).emit('connection-request', {
            technicianName: technicianInfo.name,
            technicianId: technicianInfo.id,
            sessionId: sessionId,
            timestamp: new Date().toISOString()
        });
    }
    
    async waitForApproval(sessionId, timeout) {
        return new Promise((resolve) => {
            const approval = this.pendingApprovals.get(sessionId);
            
            if (!approval) {
                resolve({ approved: false, reason: 'No pending approval' });
                return;
            }
            
            const timeoutId = setTimeout(() => {
                if (approval.status === 'pending') {
                    approval.status = 'timeout';
                    this.pendingApprovals.delete(sessionId);
                    resolve({ approved: false, reason: 'Timeout' });
                }
            }, timeout);
            
            const checkInterval = setInterval(() => {
                const currentApproval = this.pendingApprovals.get(sessionId);
                
                if (currentApproval && currentApproval.status === 'approved') {
                    clearTimeout(timeoutId);
                    clearInterval(checkInterval);
                    this.pendingApprovals.delete(sessionId);
                    resolve({ approved: true });
                } else if (currentApproval && currentApproval.status === 'denied') {
                    clearTimeout(timeoutId);
                    clearInterval(checkInterval);
                    this.pendingApprovals.delete(sessionId);
                    resolve({ approved: false, reason: 'Denied by user' });
                }
            }, 100);
        });
    }
    
    handleApprovalResponse(sessionId, approved) {
        const approval = this.pendingApprovals.get(sessionId);
        
        if (approval) {
            approval.status = approved ? 'approved' : 'denied';
            approval.respondedAt = new Date();
        }
    }
}

module.exports = ApprovalHandler;
