const pool = require('../config/database');

class Preference {
    static async findByTechnicianId(technicianId) {
        const result = await pool.query(
            'SELECT * FROM technician_preferences WHERE technician_id = $1',
            [technicianId]
        );
        return result.rows[0] || null;
    }

    static async upsert(technicianId, { dashboardLayout, sessionHistoryRetentionDays }) {
        const result = await pool.query(`
            INSERT INTO technician_preferences (technician_id, dashboard_layout, session_history_retention_days, created_at, updated_at)
            VALUES ($1, $2, $3, NOW(), NOW())
            ON CONFLICT (technician_id) DO UPDATE SET
                dashboard_layout = COALESCE($2, technician_preferences.dashboard_layout),
                session_history_retention_days = COALESCE($3, technician_preferences.session_history_retention_days),
                updated_at = NOW()
            RETURNING *
        `, [
            technicianId,
            dashboardLayout ? JSON.stringify(dashboardLayout) : null,
            sessionHistoryRetentionDays !== undefined ? sessionHistoryRetentionDays : null
        ]);
        return result.rows[0];
    }
}

module.exports = Preference;
