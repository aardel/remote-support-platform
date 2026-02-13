const pool = require('../config/database');

async function migrate() {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Create sessions table
        await client.query(`
            CREATE TABLE IF NOT EXISTS sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                session_id VARCHAR(255) UNIQUE NOT NULL,
                technician_id VARCHAR(255) NOT NULL,
                status VARCHAR(50) DEFAULT 'waiting',
                allow_unattended BOOLEAN DEFAULT true,
                client_info JSONB,
                vnc_port INTEGER,
                device_id VARCHAR(255),
                connected_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                expires_at TIMESTAMP NOT NULL
            )
        `);

        // Ensure device_id column exists
        await client.query(`
            ALTER TABLE sessions
            ADD COLUMN IF NOT EXISTS device_id VARCHAR(255)
        `);

        // Create technicians table
        await client.query(`
            CREATE TABLE IF NOT EXISTS technicians (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                username VARCHAR(255) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                last_login TIMESTAMP
            )
        `);

        // Create file_transfers table
        await client.query(`
            CREATE TABLE IF NOT EXISTS file_transfers (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                session_id VARCHAR(255) NOT NULL,
                original_name VARCHAR(255) NOT NULL,
                stored_name VARCHAR(255) NOT NULL,
                file_size BIGINT NOT NULL,
                mime_type VARCHAR(100),
                direction VARCHAR(20) NOT NULL,
                status VARCHAR(20) DEFAULT 'pending',
                uploaded_at TIMESTAMP DEFAULT NOW(),
                downloaded_at TIMESTAMP,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Create devices table
        await client.query(`
            CREATE TABLE IF NOT EXISTS devices (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                device_id VARCHAR(255) UNIQUE NOT NULL,
                technician_id VARCHAR(255),
                display_name VARCHAR(255),
                os VARCHAR(255),
                hostname VARCHAR(255),
                arch VARCHAR(50),
                last_ip VARCHAR(100),
                allow_unattended BOOLEAN DEFAULT true,
                pending_session_id VARCHAR(255),
                pending_requested_at TIMESTAMP,
                last_seen TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Create session_monitors table
        await client.query(`
            CREATE TABLE IF NOT EXISTS session_monitors (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                session_id VARCHAR(255) NOT NULL,
                monitor_index INTEGER NOT NULL,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL,
                orientation VARCHAR(20),
                is_primary BOOLEAN DEFAULT false,
                is_active BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // --- Dashboard redesign: new columns ---

        // Devices: customer/machine name + geolocation
        await client.query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255)`);
        await client.query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS machine_name VARCHAR(255)`);
        await client.query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_country VARCHAR(100)`);
        await client.query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_region VARCHAR(100)`);
        await client.query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_city VARCHAR(100)`);
        await client.query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS mac_address VARCHAR(17)`);

        // Sessions: ended_at for duration + snapshot customer/machine at connect time
        await client.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP`);
        await client.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255)`);
        await client.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS machine_name VARCHAR(255)`);
        // Sessions: live presence (helper socket + tech count) to prevent UI lockout if status drifts
        await client.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS helper_connected BOOLEAN DEFAULT false`);
        await client.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS active_technicians INTEGER DEFAULT 0`);
        // Sessions: billable/viewing presence (actual viewer connected, not just socket connected)
        await client.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS viewing_technicians INTEGER DEFAULT 0`);
        await client.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS billable_started_at TIMESTAMP`);
        await client.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS billable_seconds INTEGER DEFAULT 0`);

        // Technician preferences (widget layout, retention)
        await client.query(`
            CREATE TABLE IF NOT EXISTS technician_preferences (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                technician_id VARCHAR(255) UNIQUE NOT NULL,
                dashboard_layout JSONB,
                session_history_retention_days INTEGER,
                phone_support_rate NUMERIC(10,2) DEFAULT 0,
                whatsapp_support_rate NUMERIC(10,2) DEFAULT 0,
                remote_control_support_rate NUMERIC(10,2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await client.query(`ALTER TABLE technician_preferences ADD COLUMN IF NOT EXISTS phone_support_rate NUMERIC(10,2) DEFAULT 0`);
        await client.query(`ALTER TABLE technician_preferences ADD COLUMN IF NOT EXISTS whatsapp_support_rate NUMERIC(10,2) DEFAULT 0`);
        await client.query(`ALTER TABLE technician_preferences ADD COLUMN IF NOT EXISTS remote_control_support_rate NUMERIC(10,2) DEFAULT 0`);

        // Cases / reports (billing + problem description)
        await client.query(`
            CREATE TABLE IF NOT EXISTS cases (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                case_number BIGSERIAL UNIQUE,
                session_id VARCHAR(255),
                device_id VARCHAR(255),
                customer_name VARCHAR(255),
                machine_name VARCHAR(255),
                technician_id VARCHAR(255),
                technician_name VARCHAR(255),
                status VARCHAR(20) DEFAULT 'closed',
                problem_description TEXT NOT NULL,
                remote_viewing_seconds INTEGER DEFAULT 0,
                phone_support_minutes INTEGER DEFAULT 0,
                whatsapp_support_minutes INTEGER DEFAULT 0,
                billable_total_seconds INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Create indexes
        await client.query('CREATE INDEX IF NOT EXISTS idx_sessions_technician ON sessions(technician_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_files_session ON file_transfers(session_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_files_expires ON file_transfers(expires_at)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_monitors_session ON session_monitors(session_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_devices_technician ON devices(technician_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_devices_pending ON devices(pending_session_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_cases_device ON cases(device_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_cases_created ON cases(created_at)');

        await client.query('COMMIT');
        console.log('✅ Database migration completed successfully');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Run migration
if (require.main === module) {
    migrate()
        .then(() => {
            console.log('Migration complete');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Migration error:', error);
            process.exit(1);
        });
}

module.exports = migrate;
