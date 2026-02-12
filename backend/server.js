const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const VNCBridge = require('./services/vncBridge');
const WebSocketHandler = require('./services/websocketHandler');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Setup Socket.io
const wsHandler = new WebSocketHandler(server);
const io = wsHandler.getIO();

// Setup Approval Handler
const ApprovalHandler = require('./services/approvalHandler');
const approvalHandler = new ApprovalHandler(io);
app.set('approvalHandler', approvalHandler);

// Middleware
app.set('trust proxy', 1);
const corsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
app.use(cors({
    origin: (origin, cb) => {
        // Allow non-browser requests (no Origin) and allow all in dev if not configured.
        if (!origin) return cb(null, true);
        if (corsOrigins.length === 0) return cb(null, true);
        if (corsOrigins.includes(origin)) return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
    },
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session Management (Nextcloud OAuth2)
const sessionParser = session({
    secret: process.env.SESSION_SECRET || 'dev-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    }
});
app.use(sessionParser);

// Serve static files (customer UI)
app.use('/customer', express.static(path.join(__dirname, '../frontend/public')));

// Serve React app (technician dashboard) - built files
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Short URL redirect routes (must be before API routes)
const shortUrlRouter = require('./routes/short-url');
app.use('/s', shortUrlRouter);

// Routes
const { router: authRouter } = require('./routes/auth');
const sessionsRouter = require('./routes/sessions');
const packagesRouter = require('./routes/packages');
const filesRouter = require('./routes/files');
const monitorsRouter = require('./routes/monitors');
const devicesRouter = require('./routes/devices');
const casesRouter = require('./routes/cases');
const supportRouter = require('./routes/support');

app.use('/api/auth', authRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/packages', packagesRouter);
app.use('/api/files', filesRouter);
app.use('/api/monitors', monitorsRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/cases', casesRouter);
app.use('/api/support', supportRouter);
app.use('/api/version', require('./routes/version'));
app.use('/api/helper', require('./routes/helper'));
app.use('/api/websocket', require('./routes/websocket'));
app.use('/api/preferences', require('./routes/preferences'));
app.use('/api/statistics', require('./routes/statistics'));
app.use('/api/whats-new', require('./routes/whatsNew'));
app.use('/api/bridge', require('./routes/sessionBridge'));

// Customer support page route (download page with instructions)
app.get(['/support', '/support/'], (req, res) => {
    const ua = String(req.headers['user-agent'] || '').toLowerCase();
    const isIE = ua.includes('msie') || ua.includes('trident/');
    if (isIE) {
        try {
            const httpBase = (process.env.SERVER_URL || process.env.SUPPORT_URL || '').replace(/\/+$/, '');
            const p = path.join(__dirname, '../frontend/public/support-landing-ie.html');
            const html = fs.readFileSync(p, 'utf8')
                .replace(/___HTTPBASE___/g, httpBase);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(html);
        } catch (_) {}
    }
    res.sendFile(path.join(__dirname, '../frontend/public/support-landing.html'));
});

app.get('/support/:sessionId', (req, res) => {
    const ua = String(req.headers['user-agent'] || '').toLowerCase();
    const isIE = ua.includes('msie') || ua.includes('trident/');
    if (isIE) {
        // Serve a minimal page that works on IE (XP-era), with static links.
        try {
            const httpBase = (process.env.SERVER_URL || process.env.SUPPORT_URL || '').replace(/\/+$/, '');
            const p = path.join(__dirname, '../frontend/public/support-ie.html');
            const html = fs.readFileSync(p, 'utf8')
                .replace(/___SESSID___/g, req.params.sessionId)
                .replace(/___HTTPBASE___/g, httpBase);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(html);
        } catch (_) {
            // Fall back to the modern page if something goes wrong.
        }
    }
    res.sendFile(path.join(__dirname, '../frontend/public/support.html'));
});

// Customer connection page (for when they run the helper)
app.get('/connect/:sessionId', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

// Serve static files from frontend dist (production build)
if (fs.existsSync(path.join(__dirname, '../frontend/dist'))) {
    app.use(express.static(path.join(__dirname, '../frontend/dist')));
}

// React app route (technician dashboard)
app.get('*', (req, res, next) => {
    // Don't serve React app for API routes
    if (req.path.startsWith('/api') || req.path.startsWith('/websockify') || req.path.startsWith('/support') || req.path.startsWith('/connect')) {
        return next();
    }
    // Serve React app
    const indexPath = path.join(__dirname, '../frontend/dist/index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Frontend not built. Run: npm run build');
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.io connection handling is in websocketHandler.js (wsHandler above)
// Do NOT add duplicate io.on('connection') handlers here

// Make io and services available to routes
app.set('io', io);
app.set('approvalHandler', approvalHandler);

// Start VNC Bridge
const vncBridge = new VNCBridge(server);
vncBridge.setIo(io);
vncBridge.start();
wsHandler.setVncBridge(vncBridge);

// Start Cleanup Service
const CleanupService = require('./services/cleanup');
const cleanupService = new CleanupService();
cleanupService.start(60); // Run every hour

// Make services available to routes
app.set('vncBridge', vncBridge);
app.set('cleanupService', cleanupService);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { app, server, io, vncBridge };
