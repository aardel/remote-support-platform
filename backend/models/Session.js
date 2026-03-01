const pool = require('../config/database');

class Session {
    static async create({ technicianId, expiresIn = 3600, deviceId = null }) {
        const sessionId = this.generateSessionId();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + expiresIn * 1000);
        
        const query = `
            INSERT INTO sessions (session_id, technician_id, device_id, status, expires_at, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `;
        
        const values = [sessionId, technicianId, deviceId, 'waiting', expiresAt, now];
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

    static async findAllActive() {
        const query = `
            SELECT s.*,
                   COALESCE(s.customer_name, d.customer_name) AS customer_name,
                   COALESCE(s.machine_name, d.machine_name, d.display_name) AS machine_name,
                   d.hostname AS device_hostname,
                   d.os AS device_os,
                   d.last_ip AS device_ip,
                   d.last_country AS device_country,
                   d.last_region AS device_region,
                   d.last_city AS device_city
            FROM sessions s
            LEFT JOIN devices d ON s.device_id = d.device_id
            WHERE s.expires_at > NOW()
              AND NOT (s.technician_id = 'vnc-auto' AND s.status = 'waiting')
            ORDER BY created_at DESC
        `;
        const result = await pool.query(query);
        return result.rows;
    }
    
    /** Find an active (non-expired, waiting or connected) session for this device */
    static async findActiveByDeviceId(deviceId) {
        const query = `
            SELECT * FROM sessions 
            WHERE device_id = $1 AND expires_at > NOW() AND status IN ('waiting', 'connected')
            ORDER BY created_at DESC
            LIMIT 1
        `;
        const result = await pool.query(query, [deviceId]);
        return result.rows[0] || null;
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

    static async cleanupStaleWaiting({ olderThanHours = 24, technicianIds = ['vnc-auto'] } = {}) {
        const hours = Math.max(1, Number(olderThanHours) || 24);
        const techs = Array.isArray(technicianIds) ? technicianIds.filter(Boolean) : [];
        if (techs.length === 0) return 0;

        const query = `
            DELETE FROM sessions
            WHERE status = 'waiting'
              AND created_at < NOW() - ($1::text || ' hours')::interval
              AND technician_id = ANY($2::text[])
        `;
        const result = await pool.query(query, [String(hours), techs]);
        return result.rowCount;
    }

    static async listSessionIds() {
        const query = 'SELECT session_id FROM sessions';
        const result = await pool.query(query);
        return result.rows.map(r => r.session_id);
    }

    /** Find all sessions (including ended) for statistics, with optional filters */
    static async findForStatistics({ from, to, customer, deviceId, status } = {}) {
        const conditions = [];
        const values = [];
        let i = 1;
        if (from) { conditions.push(`created_at >= $${i++}`); values.push(from); }
        if (to) { conditions.push(`created_at <= $${i++}`); values.push(to); }
        if (customer) {
            conditions.push(`(\n+                s.customer_name ILIKE $${i} OR s.machine_name ILIKE $${i} OR\n+                d.customer_name ILIKE $${i} OR d.machine_name ILIKE $${i} OR d.hostname ILIKE $${i}\n+            )`);
            values.push(`%${customer}%`);
            i++;
        }
        if (deviceId) { conditions.push(`device_id = $${i++}`); values.push(deviceId); }
        if (status) { conditions.push(`status = $${i++}`); values.push(status); }
        const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
        const query = `
            SELECT s.*,
                   d.customer_name AS device_customer_name,
                   d.machine_name AS device_machine_name,
                   d.display_name AS device_display_name,
                   d.hostname AS device_hostname,
                   d.os AS device_os, d.last_ip AS device_ip,
                   d.last_country AS device_country, d.last_region AS device_region, d.last_city AS device_city
            FROM sessions s
            LEFT JOIN devices d ON s.device_id = d.device_id
            ${where}
            ORDER BY s.created_at DESC
            LIMIT 500
        `;
        const result = await pool.query(query, values);
        return result.rows;
    }
}

module.exports = Session;
