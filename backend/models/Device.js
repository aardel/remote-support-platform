const pool = require('../config/database');

class Device {
    static async findByDeviceId(deviceId) {
        const result = await pool.query(
            'SELECT * FROM devices WHERE device_id = $1',
            [deviceId]
        );
        return result.rows[0] || null;
    }

    static async listByTechnician(technicianId) {
        const result = await pool.query(
            'SELECT * FROM devices WHERE technician_id = $1 ORDER BY last_seen DESC NULLS LAST, created_at DESC',
            [technicianId]
        );
        return result.rows;
    }

    static async listAll() {
        const result = await pool.query(
            'SELECT * FROM devices ORDER BY last_seen DESC NULLS LAST, created_at DESC'
        );
        return result.rows;
    }

    static async deleteByDeviceId(deviceId) {
        const result = await pool.query(
            'DELETE FROM devices WHERE device_id = $1 RETURNING *',
            [deviceId]
        );
        return result.rows[0] || null;
    }

    static async upsert(device) {
        const {
            deviceId,
            technicianId,
            displayName,
            os,
            hostname,
            arch,
            lastIp,
            allowUnattended
        } = device;

        const query = `
            INSERT INTO devices (
                device_id, technician_id, display_name, os, hostname, arch, last_ip,
                allow_unattended, last_seen, created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW(),NOW())
            ON CONFLICT (device_id) DO UPDATE SET
                technician_id = COALESCE(EXCLUDED.technician_id, devices.technician_id),
                display_name = COALESCE(EXCLUDED.display_name, devices.display_name),
                os = COALESCE(EXCLUDED.os, devices.os),
                hostname = COALESCE(EXCLUDED.hostname, devices.hostname),
                arch = COALESCE(EXCLUDED.arch, devices.arch),
                last_ip = COALESCE(EXCLUDED.last_ip, devices.last_ip),
                allow_unattended = COALESCE(EXCLUDED.allow_unattended, devices.allow_unattended),
                last_seen = NOW(),
                updated_at = NOW()
            RETURNING *
        `;

        const values = [
            deviceId,
            technicianId || null,
            displayName || null,
            os || null,
            hostname || null,
            arch || null,
            lastIp || null,
            typeof allowUnattended === 'boolean' ? allowUnattended : null
        ];

        const result = await pool.query(query, values);
        return result.rows[0];
    }

    static async setPendingSession(deviceId, sessionId) {
        const result = await pool.query(
            `UPDATE devices
             SET pending_session_id = $2, pending_requested_at = NOW(), updated_at = NOW()
             WHERE device_id = $1
             RETURNING *`,
            [deviceId, sessionId]
        );
        return result.rows[0] || null;
    }

    static async clearPendingSession(deviceId) {
        const result = await pool.query(
            `UPDATE devices
             SET pending_session_id = NULL, pending_requested_at = NULL, updated_at = NOW()
             WHERE device_id = $1
             RETURNING *`,
            [deviceId]
        );
        return result.rows[0] || null;
    }
}

module.exports = Device;
