const express = require('express');
const axios = require('axios');
const https = require('https');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Technician = require('../models/Technician');

const router = express.Router();

const NEXTCLOUD_URL = process.env.NEXTCLOUD_URL;
const CLIENT_ID = process.env.NEXTCLOUD_CLIENT_ID;
const CLIENT_SECRET = process.env.NEXTCLOUD_CLIENT_SECRET;
const REDIRECT_URI = `${process.env.SERVER_URL || process.env.BACKEND_URL || 'http://localhost:3500'}/api/auth/callback`;
const ALLOW_SELF_SIGNED = process.env.NEXTCLOUD_ALLOW_SELF_SIGNED === 'true';
const httpsAgent = ALLOW_SELF_SIGNED ? new https.Agent({ rejectUnauthorized: false }) : undefined;

// Nextcloud OAuth2 login
router.get('/login', (req, res) => {
    if (!NEXTCLOUD_URL || !CLIENT_ID) {
        return res.status(500).json({ error: 'OAuth2 not configured' });
    }

    const state = uuidv4();
    req.session.oauth_state = state;

    req.session.save((err) => {
        if (err) {
            console.error('[Auth] Session save error:', err);
            return res.status(500).json({ error: 'Failed to initialize session' });
        }
        const authUrl = `${NEXTCLOUD_URL}/index.php/apps/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}`;
        res.redirect(authUrl);
    });
});

// OAuth2 callback
router.get('/callback', async (req, res) => {
    const { code, state } = req.query;

    if (!code) {
        return res.status(400).json({ error: 'No code provided' });
    }

    if (!state || state !== req.session.oauth_state) {
        return res.status(403).json({
            error: 'Invalid state',
            details: 'Authentication session timed out or was lost.'
        });
    }

    try {
        const tokenResponse = await axios.post(`${NEXTCLOUD_URL}/index.php/apps/oauth2/api/v1/token`,
            new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                redirect_uri: REDIRECT_URI
            }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            httpsAgent
        });

        const { access_token } = tokenResponse.data;

        const userResponse = await axios.get(`${NEXTCLOUD_URL}/ocs/v2.php/cloud/user?format=json`, {
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'OCS-APIRequest': 'true'
            },
            httpsAgent
        });

        const ncUser = userResponse.data.ocs.data;
        const nextcloudId = ncUser.id;
        const email = ncUser.email || null;
        const username = ncUser.displayname || ncUser.id;

        req.session.user = {
            id: nextcloudId,
            nextcloudId,
            username,
            email
        };

        res.redirect('/');
    } catch (error) {
        console.error('[Auth] OAuth2 Callback Error:', error.response?.data || error.message);
        res.status(500).send('Authentication failed');
    }
});

// Session info
router.get('/me', (req, res) => {
    if (!req.session?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json({ user: req.session.user });
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// Local auth (fallback)
router.post('/local/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email, and password required' });
        }

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

router.post('/local/login', async (req, res) => {
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

        await Technician.updateLastLogin(technician.id);

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

module.exports = { router };
