const pool = require('../config/database');

// Lazily ensure the audit table exists (migrations are not auto-run on start).
let ready = null;
function ensureTable() {
    if (ready) return ready;
    ready = pool.query(`
        CREATE TABLE IF NOT EXISTS session_audit (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id VARCHAR(255),
            device_id VARCHAR(255),
            event VARCHAR(64) NOT NULL,
            actor VARCHAR(255),
            detail JSONB,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `)
        .then(() => pool.query('CREATE INDEX IF NOT EXISTS idx_session_audit_session ON session_audit(session_id)'))
        .then(() => pool.query('CREATE INDEX IF NOT EXISTS idx_session_audit_created ON session_audit(created_at DESC)'))
        .catch((e) => { ready = null; throw e; });
    return ready;
}

class AuditLog {
    // Record an event. Never throws — auditing must not break the main flow.
    static async log(event, { sessionId = null, deviceId = null, actor = null, detail = null } = {}) {
        try {
            await ensureTable();
            await pool.query(
                'INSERT INTO session_audit (session_id, device_id, event, actor, detail) VALUES ($1,$2,$3,$4,$5)',
                [
                    sessionId,
                    deviceId,
                    String(event).slice(0, 64),
                    actor != null ? String(actor).slice(0, 255) : null,
                    detail != null ? JSON.stringify(detail) : null
                ]
            );
        } catch (e) {
            console.warn('Audit log failed:', e.message);
        }
    }

    static async recent(limit = 200) {
        await ensureTable();
        const r = await pool.query(
            'SELECT * FROM session_audit ORDER BY created_at DESC LIMIT $1',
            [Math.min(Number(limit) || 200, 1000)]
        );
        return r.rows;
    }

    static async bySession(sessionId) {
        await ensureTable();
        const r = await pool.query(
            'SELECT * FROM session_audit WHERE session_id = $1 ORDER BY created_at ASC',
            [sessionId]
        );
        return r.rows;
    }

    // Event counts over the last N days: { event: count, ... }
    static async stats(days = 7) {
        await ensureTable();
        const r = await pool.query(
            `SELECT event, COUNT(*)::int AS count
               FROM session_audit
              WHERE created_at > NOW() - ($1 || ' days')::interval
              GROUP BY event`,
            [String(Math.max(1, Math.min(Number(days) || 7, 365)))]
        );
        const byEvent = {};
        r.rows.forEach((row) => { byEvent[row.event] = row.count; });
        return byEvent;
    }
}

module.exports = AuditLog;
