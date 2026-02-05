const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Technician = require('../models/Technician');

// Register technician
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email, and password required' });
        }
        
        // Check if username or email already exists
        const existingUser = await Technician.findByUsername(username) || 
                           await Technician.findByEmail(email);
        
        if (existingUser) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }
        
        const technician = await Technician.create({ username, email, password });
        
        res.json({
            success: true,
            technician: {
                id: technician.id,
                username: technician.username,
                email: technician.email
            }
        });
    } catch (error) {
        console.error('Error registering technician:', error);
        res.status(500).json({ error: error.message });
    }
});

// Login technician
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        
        const technician = await Technician.findByUsername(username);
        
        if (!technician) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const isValid = await Technician.verifyPassword(technician, password);
        
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Update last login
        await Technician.updateLastLogin(technician.id);
        
        // Generate JWT token
        const token = jwt.sign(
            { id: technician.id, username: technician.username },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            token,
            technician: {
                id: technician.id,
                username: technician.username,
                email: technician.email
            }
        });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ error: error.message });
    }
});

// Verify token middleware
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        req.technicianId = decoded.id;
        req.technicianUsername = decoded.username;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

module.exports = { router, verifyToken };
