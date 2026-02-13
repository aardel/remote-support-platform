const pool = require('../config/database');

class Case {
    static async create(data) {
        const {
            sessionId,
            deviceId,
            customerName,
            machineName,
            technicianId,
            technicianName,
            status = 'closed',
            problemDescription,
            remoteViewingSeconds = 0,
            phoneSupportMinutes = 0,
            whatsappSupportMinutes = 0,
            billableTotalSeconds = 0
        } = data;

        const query = `
            INSERT INTO cases (
                session_id, device_id, customer_name, machine_name,
                technician_id, technician_name, status, problem_description,
                remote_viewing_seconds, phone_support_minutes, whatsapp_support_minutes,
                billable_total_seconds, created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())
            RETURNING *
        `;

        const values = [
            sessionId || null,
            deviceId || null,
            customerName || null,
            machineName || null,
            technicianId || null,
            technicianName || null,
            status || 'closed',
            problemDescription,
            Math.max(0, Number(remoteViewingSeconds) || 0),
            Math.max(0, Number(phoneSupportMinutes) || 0),
            Math.max(0, Number(whatsappSupportMinutes) || 0),
            Math.max(0, Number(billableTotalSeconds) || 0)
        ];
        const result = await pool.query(query, values);
        return result.rows[0];
    }

    static async findById(id) {
        const result = await pool.query('SELECT * FROM cases WHERE id = $1', [id]);
        return result.rows[0] || null;
    }

    static async findLatestBySessionId(sessionId) {
        const result = await pool.query(
            'SELECT * FROM cases WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1',
            [sessionId]
        );
        return result.rows[0] || null;
    }

    static async updateById(id, data) {
        const fields = [];
        const values = [];
        let i = 1;
        const assign = (col, val) => {
            if (val === undefined) return;
            fields.push(`${col} = $${i++}`);
            values.push(val);
        };
        assign('status', data.status);
        assign('problem_description', data.problemDescription);
        assign('remote_viewing_seconds', data.remoteViewingSeconds);
        assign('phone_support_minutes', data.phoneSupportMinutes);
        assign('whatsapp_support_minutes', data.whatsappSupportMinutes);
        assign('billable_total_seconds', data.billableTotalSeconds);
        assign('technician_id', data.technicianId);
        assign('technician_name', data.technicianName);
        assign('customer_name', data.customerName);
        assign('machine_name', data.machineName);
        if (!fields.length) return this.findById(id);
        fields.push(`updated_at = NOW()`);
        values.push(id);
        const result = await pool.query(
            `UPDATE cases SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
            values
        );
        return result.rows[0] || null;
    }

    static async deleteById(id) {
        const result = await pool.query('DELETE FROM cases WHERE id = $1 RETURNING id', [id]);
        return result.rows[0] || null;
    }

    static async list({ status, q, deviceId, limit = 200 } = {}) {
        const conditions = [];
        const values = [];
        let i = 1;
        if (status) { conditions.push(`status = $${i++}`); values.push(status); }
        if (deviceId) { conditions.push(`device_id = $${i++}`); values.push(deviceId); }
        if (q) {
            conditions.push(`(
                COALESCE(customer_name,'') ILIKE $${i} OR
                COALESCE(machine_name,'') ILIKE $${i} OR
                COALESCE(technician_name,'') ILIKE $${i} OR
                COALESCE(session_id,'') ILIKE $${i} OR
                COALESCE(problem_description,'') ILIKE $${i}
            )`);
            values.push(`%${q}%`);
            i++;
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const lim = Math.min(500, Math.max(1, Number(limit) || 200));
        const result = await pool.query(
            `SELECT * FROM cases ${where} ORDER BY created_at DESC LIMIT ${lim}`,
            values
        );
        return result.rows;
    }
}

module.exports = Case;
