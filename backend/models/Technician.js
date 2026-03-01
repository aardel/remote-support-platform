const pool = require('../config/database');
const bcrypt = require('bcrypt');

class Technician {
    static async create({ username, email, password }) {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const query = `
            INSERT INTO technicians (username, email, password_hash, created_at)
            VALUES ($1, $2, $3, NOW())
            RETURNING id, username, email, created_at
        `;
        
        const result = await pool.query(query, [username, email, hashedPassword]);
        return result.rows[0];
    }
    
    static async findByUsername(username) {
        const query = 'SELECT * FROM technicians WHERE username = $1';
        const result = await pool.query(query, [username]);
        return result.rows[0] || null;
    }
    
    static async findByEmail(email) {
        const query = 'SELECT * FROM technicians WHERE email = $1';
        const result = await pool.query(query, [email]);
        return result.rows[0] || null;
    }
    
    static async findById(id) {
        const query = 'SELECT id, username, email, created_at, last_login FROM technicians WHERE id = $1';
        const result = await pool.query(query, [id]);
        return result.rows[0] || null;
    }
    
    static async verifyPassword(technician, password) {
        return await bcrypt.compare(password, technician.password_hash);
    }
    
    static async updateLastLogin(id) {
        const query = 'UPDATE technicians SET last_login = NOW() WHERE id = $1';
        await pool.query(query, [id]);
    }
}

module.exports = Technician;
