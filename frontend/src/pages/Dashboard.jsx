import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';
import './Dashboard.css';

function Dashboard() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const navigate = useNavigate();
  const technician = JSON.parse(localStorage.getItem('technician') || '{}');

  useEffect(() => {
    loadSessions();
    setupWebSocket();
  }, []);

  const setupWebSocket = () => {
    const socket = io(window.location.origin);
    
    socket.on('session-connected', (data) => {
      setSessions(prev => prev.map(s => 
        s.session_id === data.sessionId 
          ? { ...s, status: 'connected', client_info: data.clientInfo }
          : s
      ));
    });

    return () => socket.disconnect();
  };

  const loadSessions = async () => {
    try {
      // For now, we'll create sessions on demand
      // In production, fetch from API
      setLoading(false);
    } catch (error) {
      console.error('Error loading sessions:', error);
      setLoading(false);
    }
  };

  const generatePackage = async () => {
    setGenerating(true);
    try {
      const response = await axios.post('/api/packages/generate', {
        technicianId: technician.id || 'tech123'
      });

      if (response.data.success) {
        const newSession = {
          session_id: response.data.sessionId,
          technician_id: technician.id,
          status: 'waiting',
          created_at: new Date().toISOString(),
          expires_at: response.data.expiresAt,
          link: response.data.directLink,
          downloadUrl: response.data.downloadUrl
        };

        setSessions(prev => [newSession, ...prev]);
        
        // Show success message with shareable link
        const shareLink = response.data.directLink;
        const message = `✅ Support package generated!\n\n📋 Share this link with your customer:\n${shareLink}\n\nThey will see download instructions and can get the support helper package.`;
        alert(message);
        
        // Copy link to clipboard
        navigator.clipboard.writeText(shareLink).then(() => {
          console.log('Link copied to clipboard');
        });
      }
    } catch (error) {
      console.error('Error generating package:', error);
      alert('Error generating package: ' + (error.response?.data?.error || error.message));
    } finally {
      setGenerating(false);
    }
  };

  const connectToSession = async (sessionId) => {
    try {
      // Request connection approval
      const response = await axios.post(`/api/sessions/${sessionId}/connect`, {
        technicianId: technician.id,
        technicianName: technician.username
      });

      if (response.data.approved) {
        navigate(`/session/${sessionId}`);
      } else {
        alert('Connection denied: ' + (response.data.reason || 'User denied'));
      }
    } catch (error) {
      console.error('Error connecting:', error);
      alert('Error connecting: ' + (error.response?.data?.error || error.message));
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('technician');
    navigate('/login');
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>🔧 Remote Support Dashboard</h1>
        <div className="header-actions">
          <span className="technician-name">Welcome, {technician.username}</span>
          <button onClick={logout} className="logout-btn">Logout</button>
        </div>
      </header>

      <div className="dashboard-content">
        <div className="dashboard-actions">
          <button 
            onClick={generatePackage} 
            disabled={generating}
            className="generate-btn"
          >
            {generating ? 'Generating...' : '➕ Generate Support Package'}
          </button>
        </div>

        <div className="sessions-list">
          <h2>Active Sessions</h2>
          
          {sessions.length === 0 ? (
            <div className="empty-state">
              <p>No active sessions</p>
              <p>Generate a package to start a support session</p>
            </div>
          ) : (
            <div className="sessions-grid">
              {sessions.map(session => (
                <div key={session.session_id} className="session-card">
                  <div className="session-header">
                    <span className="session-id">{session.session_id}</span>
                    <span className={`status-badge ${session.status}`}>
                      {session.status}
                    </span>
                  </div>
                  
                  <div className="session-info">
                    {session.client_info && (
                      <div className="client-info">
                        <strong>OS:</strong> {session.client_info.os || 'Unknown'}
                        <br />
                        <strong>Hostname:</strong> {session.client_info.hostname || 'Unknown'}
                      </div>
                    )}
                    
                    <div className="session-meta">
                      <small>Created: {new Date(session.created_at).toLocaleString()}</small>
                    </div>
                  </div>
                  
                  <div className="session-info">
                    {session.link && (
                      <div className="share-link-section" style={{ marginTop: '15px', padding: '10px', background: '#f0f9ff', borderRadius: '6px' }}>
                        <strong style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '5px' }}>Share this link:</strong>
                        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                          <input 
                            type="text" 
                            value={session.link} 
                            readOnly 
                            style={{ 
                              flex: 1, 
                              padding: '6px', 
                              border: '1px solid #ddd', 
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontFamily: 'monospace'
                            }}
                            onClick={(e) => e.target.select()}
                          />
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(session.link);
                              alert('Link copied to clipboard!');
                            }}
                            style={{
                              padding: '6px 12px',
                              background: '#2563eb',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="session-actions">
                    {session.status === 'connected' ? (
                      <button 
                        onClick={() => connectToSession(session.session_id)}
                        className="connect-btn"
                      >
                        Connect
                      </button>
                    ) : (
                      <span className="waiting-text">Waiting for user...</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
