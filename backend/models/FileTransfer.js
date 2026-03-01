const pool = require('../config/database');

class FileTransfer {
    static async create({ sessionId, originalName, storedName, size, mimeType, direction }) {
        const expiresAt = new Date(Date.now() + 3600000); // 1 hour
        
        const query = `
            INSERT INTO file_transfers 
            (session_id, original_name, stored_name, file_size, mime_type, direction, expires_at, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            RETURNING *
        `;
        
        const values = [sessionId, originalName, storedName, size, mimeType, direction, expiresAt];
        const result = await pool.query(query, values);
        
        return result.rows[0];
    }
    
    static async findById(id) {
        const query = 'SELECT * FROM file_transfers WHERE id = $1';
        const result = await pool.query(query, [id]);
        return result.rows[0] || null;
    }
    
    static async findBySession(sessionId) {
        const query = `
            SELECT * FROM file_transfers 
            WHERE session_id = $1 
            ORDER BY created_at DESC
        `;
        const result = await pool.query(query, [sessionId]);
        return result.rows;
    }
    
    static async markDownloaded(id) {
        const query = `
            UPDATE file_transfers 
            SET status = 'downloaded', downloaded_at = NOW()
            WHERE id = $1
        `;
        await pool.query(query, [id]);
    }
    
    static async delete(id) {
        const query = 'DELETE FROM file_transfers WHERE id = $1';
        await pool.query(query, [id]);
    }
    
    static async cleanupExpired() {
        const query = 'DELETE FROM file_transfers WHERE expires_at < NOW()';
        const result = await pool.query(query);
        return result.rowCount;
    }
}

module.exports = FileTransfer;
