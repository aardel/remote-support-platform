// Cleanup expired sessions and files periodically
const Session = require('../models/Session');
const FileTransfer = require('../models/FileTransfer');

class CleanupService {
    constructor() {
        this.interval = null;
    }
    
    start(intervalMinutes = 60) {
        // Run cleanup immediately
        this.runCleanup();
        
        // Then run periodically
        this.interval = setInterval(() => {
            this.runCleanup();
        }, intervalMinutes * 60 * 1000);
        
        console.log(`🧹 Cleanup service started (runs every ${intervalMinutes} minutes)`);
    }
    
    async runCleanup() {
        try {
            console.log('🧹 Running cleanup...');
            
            // Cleanup expired sessions
            const deletedSessions = await Session.cleanupExpired();
            console.log(`   Deleted ${deletedSessions} expired sessions`);
            
            // Cleanup expired files
            const deletedFiles = await FileTransfer.cleanupExpired();
            console.log(`   Deleted ${deletedFiles} expired files`);
            
        } catch (error) {
            console.error('❌ Cleanup error:', error);
        }
    }
    
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
}

module.exports = CleanupService;
