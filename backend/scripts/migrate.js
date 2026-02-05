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
        
        // Create indexes
        await client.query('CREATE INDEX IF NOT EXISTS idx_sessions_technician ON sessions(technician_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_files_session ON file_transfers(session_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_files_expires ON file_transfers(expires_at)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_monitors_session ON session_monitors(session_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_devices_technician ON devices(technician_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_devices_pending ON devices(pending_session_id)');
        
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
