// Maps VNC reverse connections to session IDs
// When user connects via reverse VNC, we need to identify which session it belongs to

class SessionMapper {
    constructor() {
        this.connectionMap = new Map(); // connectionId -> sessionId
        this.sessionConnections = new Map(); // sessionId -> connectionId
    }
    
    // Register a connection for a session
    registerConnection(sessionId, connectionId) {
        this.connectionMap.set(connectionId, sessionId);
        this.sessionConnections.set(sessionId, connectionId);
    }
    
    // Get session ID for a connection
    getSessionId(connectionId) {
        return this.connectionMap.get(connectionId);
    }
    
    // Get connection ID for a session
    getConnectionId(sessionId) {
        return this.sessionConnections.get(sessionId);
    }
    
    // Remove mapping
    removeConnection(connectionId) {
        const sessionId = this.connectionMap.get(connectionId);
        if (sessionId) {
            this.sessionConnections.delete(sessionId);
        }
        this.connectionMap.delete(connectionId);
    }
    
    // Remove session mapping
    removeSession(sessionId) {
        const connectionId = this.sessionConnections.get(sessionId);
        if (connectionId) {
            this.connectionMap.delete(connectionId);
        }
        this.sessionConnections.delete(sessionId);
    }
}

module.exports = new SessionMapper();
