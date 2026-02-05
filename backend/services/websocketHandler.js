const { Server } = require('socket.io');

class WebSocketHandler {
    constructor(server) {
        this.io = new Server(server, {
            cors: {
                origin: process.env.CLIENT_URL || "*",
                methods: ["GET", "POST"]
            }
        });
        
        this.setupHandlers();
    }
    
    setupHandlers() {
        this.io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);
            
            // Join session room
            socket.on('join-session', (data) => {
                const { sessionId } = data;
                socket.join(`session-${sessionId}`);
                console.log(`Socket ${socket.id} joined session ${sessionId}`);
            });
            
            // Leave session room
            socket.on('leave-session', (data) => {
                const { sessionId } = data;
                socket.leave(`session-${sessionId}`);
                console.log(`Socket ${socket.id} left session ${sessionId}`);
            });
            
            // Handle approval responses
            socket.on('approval-response', (data) => {
                const { sessionId, approved } = data;
                // This will be handled by session service
                console.log(`Approval response for ${sessionId}: ${approved ? 'approved' : 'denied'}`);
            });
            
            socket.on('disconnect', () => {
                console.log('Client disconnected:', socket.id);
            });
        });
    }
    
    getIO() {
        return this.io;
    }
}

module.exports = WebSocketHandler;
