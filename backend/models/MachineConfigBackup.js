const pool = require('../config/database');

// Durable, server-side safety backups for machine configuration files
// (.mk / pfields.dat) edited via the in-session parameter editor. Unlike the
// editors' own in-browser "backup" (an in-memory array that vanishes when the
// tab closes), these rows persist independently of the browser, the session,
// and the customer's machine — a bad edit can always be reverted from here.
let ready = null;
function ensureTable() {
    if (ready) return ready;
    ready = pool.query(`
        CREATE TABLE IF NOT EXISTS machine_config_backups (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id VARCHAR(255),
            device_id VARCHAR(255),
            file_path TEXT NOT NULL,
            content TEXT NOT NULL,
            technician VARCHAR(255),
            reason VARCHAR(32) NOT NULL DEFAULT 'pre-edit',
            created_at TIMESTAMP DEFAULT NOW()
        )
    `)
        // On-machine copy of the backup (same folder as the original, timestamped
        // filename) so anyone opening the machine's own filesystem — not just this
        // tool — can see it too. Added after the table already existed elsewhere;
        // ADD COLUMN IF NOT EXISTS keeps existing rows intact (NULL = DB-only,
        // pre-dates this feature).
        .then(() => pool.query('ALTER TABLE machine_config_backups ADD COLUMN IF NOT EXISTS on_machine_path TEXT'))
        .then(() => pool.query('CREATE INDEX IF NOT EXISTS idx_mcb_device ON machine_config_backups(device_id)'))
        .then(() => pool.query('CREATE INDEX IF NOT EXISTS idx_mcb_session ON machine_config_backups(session_id)'))
        .then(() => pool.query('CREATE INDEX IF NOT EXISTS idx_mcb_created ON machine_config_backups(created_at DESC)'))
        .catch((e) => { ready = null; throw e; });
    return ready;
}

class MachineConfigBackup {
    static async create({ sessionId, deviceId, filePath, content, technician, reason = 'pre-edit', onMachinePath = null }) {
        await ensureTable();
        const r = await pool.query(
            `INSERT INTO machine_config_backups (session_id, device_id, file_path, content, technician, reason, on_machine_path)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, session_id, device_id, file_path, technician, reason, on_machine_path, created_at`,
            [sessionId || null, deviceId || null, filePath, content, technician || null, reason, onMachinePath]
        );
        return r.rows[0];
    }

    // List for a device (or session) — metadata only, not full content (could be large-ish, and a list view doesn't need it).
    static async list({ deviceId, sessionId, filePath, limit = 100 }) {
        await ensureTable();
        const clauses = [];
        const values = [];
        if (deviceId) { values.push(deviceId); clauses.push(`device_id = $${values.length}`); }
        if (sessionId) { values.push(sessionId); clauses.push(`session_id = $${values.length}`); }
        if (filePath) { values.push(filePath); clauses.push(`file_path = $${values.length}`); }
        const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
        values.push(Math.min(Number(limit) || 100, 500));
        const r = await pool.query(
            `SELECT id, session_id, device_id, file_path, technician, reason, on_machine_path, created_at, length(content) AS content_length
               FROM machine_config_backups ${where}
              ORDER BY created_at DESC LIMIT $${values.length}`,
            values
        );
        return r.rows;
    }

    static async getById(id) {
        await ensureTable();
        const r = await pool.query('SELECT * FROM machine_config_backups WHERE id = $1', [id]);
        return r.rows[0] || null;
    }
}

module.exports = MachineConfigBackup;
