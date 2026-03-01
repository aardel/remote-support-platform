const Technician = require('../models/Technician');

async function createTestTechnician() {
    try {
        const technician = await Technician.create({
            username: 'admin',
            email: 'admin@test.com',
            password: 'admin123'
        });
        
        console.log('✅ Test technician created successfully!');
        console.log('Username: admin');
        console.log('Password: admin123');
        console.log('Email: admin@test.com');
        console.log('\nYou can now log in with these credentials.');
    } catch (error) {
        if (error.code === '23505') {
            console.log('ℹ️  Technician "admin" already exists.');
            console.log('Username: admin');
            console.log('Password: admin123');
        } else {
            console.error('❌ Error creating technician:', error.message);
            console.error('\nMake sure:');
            console.error('1. PostgreSQL is running');
            console.error('2. Database "remote_support" exists');
            console.error('3. Migrations have been run (npm run migrate)');
            console.error('4. Database connection is configured in .env');
        }
    }
    process.exit(0);
}

createTestTechnician();
