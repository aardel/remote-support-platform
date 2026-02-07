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
app.use(cors({
    origin: true,
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

// Routes
const { router: authRouter } = require('./routes/auth');
const sessionsRouter = require('./routes/sessions');
const packagesRouter = require('./routes/packages');
const filesRouter = require('./routes/files');
const monitorsRouter = require('./routes/monitors');
const devicesRouter = require('./routes/devices');

app.use('/api/auth', authRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/packages', packagesRouter);
app.use('/api/files', filesRouter);
app.use('/api/monitors', monitorsRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/version', require('./routes/version'));
app.use('/api/helper', require('./routes/helper'));
app.use('/api/websocket', require('./routes/websocket'));

// Customer support page route (download page with instructions)
app.get('/support/:sessionId', (req, res) => {
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

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
    
    // Session management events
    socket.on('join-session', (data) => {
        socket.join(`session-${data.sessionId}`);
        console.log(`Socket ${socket.id} joined session ${data.sessionId}`);
    });
    
    socket.on('leave-session', (data) => {
        socket.leave(`session-${data.sessionId}`);
        console.log(`Socket ${socket.id} left session ${data.sessionId}`);
    });
});

// Make io and services available to routes
app.set('io', io);
app.set('approvalHandler', approvalHandler);

// Start VNC Bridge
const vncBridge = new VNCBridge(server);
vncBridge.start();

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
