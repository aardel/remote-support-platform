const pool = require('../config/database');

// Lazily ensure optional columns exist (migrations are not auto-run on start).
let schemaReady = null;
function ensureSchema() {
    if (schemaReady) return schemaReady;
    schemaReady = pool.query('ALTER TABLE devices ADD COLUMN IF NOT EXISTS tag VARCHAR(100)')
        .then(() => pool.query('ALTER TABLE devices ADD COLUMN IF NOT EXISTS helper_version VARCHAR(32)'))
        .then(() => pool.query('ALTER TABLE devices ADD COLUMN IF NOT EXISTS short_code VARCHAR(9)'))
        .then(() => pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_short_code ON devices(short_code) WHERE short_code IS NOT NULL'))
        .catch((e) => { schemaReady = null; throw e; });
    return schemaReady;
}

// A short, human-readable code (like AnyDesk's ID) a customer can read aloud
// or type in, so a technician can start a session without the device already
// being in their known-devices list. Plain 9 digits — easy to read/type on
// any keyboard, no case-sensitivity or ambiguous-character concerns.
function randomNineDigitCode() {
    return String(Math.floor(100000000 + Math.random() * 900000000));
}

async function generateUniqueShortCode() {
    for (let attempt = 0; attempt < 10; attempt++) {
        const code = randomNineDigitCode();
        const existing = await pool.query('SELECT 1 FROM devices WHERE short_code = $1', [code]);
        if (existing.rows.length === 0) return code;
    }
    throw new Error('Could not generate a unique short code after 10 attempts');
}

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
        try { await ensureSchema(); } catch (_) {}
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
            allowUnattended,
            macAddress,
            helperVersion
        } = device;

        try { await ensureSchema(); } catch (_) {}

        // Only a genuinely new device needs a code generated; an existing one
        // keeps whatever it already has (COALESCE below never overwrites it).
        // Generating unconditionally is harmless — the candidate is simply
        // discarded by COALESCE when the row already has a code.
        const candidateCode = await generateUniqueShortCode();

        const query = `
            INSERT INTO devices (
                device_id, technician_id, display_name, os, hostname, arch, last_ip,
                allow_unattended, mac_address, helper_version, short_code, last_seen, created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW(),NOW())
            ON CONFLICT (device_id) DO UPDATE SET
                technician_id = COALESCE(EXCLUDED.technician_id, devices.technician_id),
                display_name = COALESCE(EXCLUDED.display_name, devices.display_name),
                os = COALESCE(EXCLUDED.os, devices.os),
                hostname = COALESCE(EXCLUDED.hostname, devices.hostname),
                arch = COALESCE(EXCLUDED.arch, devices.arch),
                last_ip = COALESCE(EXCLUDED.last_ip, devices.last_ip),
                allow_unattended = COALESCE(EXCLUDED.allow_unattended, devices.allow_unattended),
                mac_address = COALESCE(EXCLUDED.mac_address, devices.mac_address),
                helper_version = COALESCE(EXCLUDED.helper_version, devices.helper_version),
                short_code = COALESCE(devices.short_code, EXCLUDED.short_code),
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
            typeof allowUnattended === 'boolean' ? allowUnattended : null,
            macAddress || null,
            helperVersion ? String(helperVersion).slice(0, 32) : null,
            candidateCode
        ];

        const result = await pool.query(query, values);
        return result.rows[0];
    }

    static async findByShortCode(code) {
        const normalized = String(code || '').replace(/\D/g, '');
        if (!normalized) return null;
        const result = await pool.query('SELECT * FROM devices WHERE short_code = $1', [normalized]);
        return result.rows[0] || null;
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

    static async updateNames(deviceId, { customerName, machineName, tag }) {
        try { await ensureSchema(); } catch (_) {}
        const fields = [];
        const values = [];
        let i = 1;
        if (customerName !== undefined) { fields.push(`customer_name = $${i++}`); values.push(customerName || null); }
        if (machineName !== undefined) { fields.push(`machine_name = $${i++}`); values.push(machineName || null); }
        if (tag !== undefined) { fields.push(`tag = $${i++}`); values.push((tag || '').slice(0, 100) || null); }
        if (fields.length === 0) return this.findByDeviceId(deviceId);
        fields.push(`updated_at = NOW()`);
        values.push(deviceId);
        const result = await pool.query(
            `UPDATE devices SET ${fields.join(', ')} WHERE device_id = $${i} RETURNING *`,
            values
        );
        return result.rows[0] || null;
    }

    static async updateGeo(deviceId, { country, region, city }) {
        const result = await pool.query(
            `UPDATE devices SET last_country = $2, last_region = $3, last_city = $4, updated_at = NOW() WHERE device_id = $1 RETURNING *`,
            [deviceId, country || null, region || null, city || null]
        );
        return result.rows[0] || null;
    }

    static async touchLastSeen(deviceId) {
        await pool.query(
            'UPDATE devices SET last_seen = NOW(), updated_at = NOW() WHERE device_id = $1',
            [deviceId]
        );
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
