// Cleanup expired sessions and files periodically
const Session = require('../models/Session');
const FileTransfer = require('../models/FileTransfer');
const PackageArtifacts = require('./packageArtifacts');

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

            // Cleanup stale waiting sessions for selected technician IDs (safe default: vnc-auto only).
            const staleHours = Math.max(1, Number(process.env.STALE_WAITING_SESSION_HOURS || 24) || 24);
            const staleTechIds = String(process.env.STALE_WAITING_SESSION_TECHNICIAN_IDS || 'vnc-auto')
                .split(',')
                .map(s => s.trim())
                .filter(Boolean);
            const deletedStaleWaiting = await Session.cleanupStaleWaiting({
                olderThanHours: staleHours,
                technicianIds: staleTechIds
            });
            console.log(`   Deleted ${deletedStaleWaiting} stale waiting sessions (>${staleHours}h, techs: ${staleTechIds.join(',')})`);

            // Cleanup orphaned support package artifacts on disk (best-effort)
            try {
                const validSessionIds = await Session.listSessionIds();
                const stats = await PackageArtifacts.cleanupOrphanArtifacts({ validSessionIds });
                console.log(`   Deleted ${stats.deletedDirs} orphan session dirs and ${stats.deletedFiles} orphan support files`);
            } catch (e) {
                console.warn('   Skipped package artifact cleanup:', e.message);
            }
            
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
