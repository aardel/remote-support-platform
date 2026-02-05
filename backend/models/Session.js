const pool = require('../config/database');

class Session {
    static async create({ technicianId, expiresIn = 3600 }) {
        const sessionId = this.generateSessionId();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + expiresIn * 1000);
        
        const query = `
            INSERT INTO sessions (session_id, technician_id, status, expires_at, created_at)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        
        const values = [sessionId, technicianId, 'waiting', expiresAt, now];
        const result = await pool.query(query, values);
        
        return result.rows[0];
    }
    
    static async findBySessionId(sessionId) {
        const query = 'SELECT * FROM sessions WHERE session_id = $1';
        const result = await pool.query(query, [sessionId]);
        
        if (result.rows.length === 0) {
            return null;
        }
        
        const session = result.rows[0];
        
        // Check if expired
        if (new Date() > new Date(session.expires_at)) {
            await this.delete(sessionId);
            return null;
        }
        
        return session;
    }
    
    static async update(sessionId, updates) {
        const fields = [];
        const values = [];
        let paramCount = 1;
        
        for (const [key, value] of Object.entries(updates)) {
            fields.push(`${key} = $${paramCount++}`);
            values.push(value);
        }
        
        values.push(sessionId);
        const query = `
            UPDATE sessions 
            SET ${fields.join(', ')}, updated_at = NOW()
            WHERE session_id = $${paramCount}
            RETURNING *
        `;
        
        const result = await pool.query(query, values);
        return result.rows[0];
    }
    
    static async delete(sessionId) {
        const query = 'DELETE FROM sessions WHERE session_id = $1';
        await pool.query(query, [sessionId]);
    }
    
    static async findByTechnician(technicianId) {
        const query = `
            SELECT * FROM sessions 
            WHERE technician_id = $1 
            ORDER BY created_at DESC
        `;
        const result = await pool.query(query, [technicianId]);
        return result.rows;
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
    
    static async cleanupExpired() {
        const query = 'DELETE FROM sessions WHERE expires_at < NOW()';
        const result = await pool.query(query);
        return result.rowCount;
    }
}

module.exports = Session;
