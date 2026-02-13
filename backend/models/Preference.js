const pool = require('../config/database');

class Preference {
    static async findByTechnicianId(technicianId) {
        const result = await pool.query(
            'SELECT * FROM technician_preferences WHERE technician_id = $1',
            [technicianId]
        );
        return result.rows[0] || null;
    }

    static async upsert(technicianId, {
        dashboardLayout,
        sessionHistoryRetentionDays,
        phoneSupportRate,
        whatsappSupportRate,
        remoteControlSupportRate
    }) {
        const result = await pool.query(`
            INSERT INTO technician_preferences (
                technician_id,
                dashboard_layout,
                session_history_retention_days,
                phone_support_rate,
                whatsapp_support_rate,
                remote_control_support_rate,
                created_at,
                updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
            ON CONFLICT (technician_id) DO UPDATE SET
                dashboard_layout = COALESCE($2, technician_preferences.dashboard_layout),
                session_history_retention_days = COALESCE($3, technician_preferences.session_history_retention_days),
                phone_support_rate = COALESCE($4, technician_preferences.phone_support_rate),
                whatsapp_support_rate = COALESCE($5, technician_preferences.whatsapp_support_rate),
                remote_control_support_rate = COALESCE($6, technician_preferences.remote_control_support_rate),
                updated_at = NOW()
            RETURNING *
        `, [
            technicianId,
            dashboardLayout ? JSON.stringify(dashboardLayout) : null,
            sessionHistoryRetentionDays !== undefined ? sessionHistoryRetentionDays : null,
            phoneSupportRate !== undefined ? phoneSupportRate : null,
            whatsappSupportRate !== undefined ? whatsappSupportRate : null,
            remoteControlSupportRate !== undefined ? remoteControlSupportRate : null
        ]);
        return result.rows[0];
    }
}

module.exports = Preference;
