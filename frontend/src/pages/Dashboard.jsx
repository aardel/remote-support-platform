import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';
import './Dashboard.css';

function Dashboard({ user, onLogout }) {
  const [sessions, setSessions] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [requestingDevice, setRequestingDevice] = useState(null);
  const [templateType, setTemplateType] = useState('exe');
  const [templateFile, setTemplateFile] = useState(null);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [templateStatus, setTemplateStatus] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [appVersion, setAppVersion] = useState(null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const technician = user || {};

  useEffect(() => {
    loadSessions();
    loadDevices();
    loadTemplateStatus();
    setupWebSocket();
    axios.get('/api/version').then(r => setAppVersion(r.data.version)).catch(() => {});
  }, []);

  const setupWebSocket = () => {
    const socket = io(window.location.origin);

    // Listen for session updates (global broadcast)
    socket.on('session-updated', (data) => {
      setSessions(prev => prev.map(s => {
        const sId = s.session_id || s.sessionId;
        if (sId === data.sessionId) {
          return { ...s, status: data.status, client_info: data.clientInfo };
        }
        return s;
      }));
    });

    // Also listen for specific session-connected events
    socket.on('session-connected', (data) => {
      setSessions(prev => prev.map(s => {
        const sId = s.session_id || s.sessionId;
        if (sId === data.sessionId) {
          return { ...s, status: 'connected', client_info: data.clientInfo };
        }
        return s;
      }));
    });

    // Listen for session deletion
    socket.on('session-ended', (data) => {
      setSessions(prev => prev.filter(s => {
        const sId = s.session_id || s.sessionId;
        return sId !== data.sessionId;
      }));
    });

    return () => socket.disconnect();
  };

  const loadSessions = async () => {
    try {
      const response = await axios.get('/api/sessions');
      setSessions(response.data.sessions || []);
      setLoading(false);
    } catch (error) {
      console.error('Error loading sessions:', error);
      setLoading(false);
    }
  };

  const deleteSession = async (sessionId) => {
    if (!confirm(`Delete session ${sessionId}?`)) return;
    try {
      await axios.delete(`/api/sessions/${sessionId}`);
      setSessions(prev => prev.filter(s => (s.session_id || s.sessionId) !== sessionId));
    } catch (error) {
      console.error('Error deleting session:', error);
      alert('Error deleting session: ' + (error.response?.data?.error || error.message));
    }
  };

  const loadDevices = async () => {
    try {
      const response = await axios.get('/api/devices');
      setDevices(response.data.devices || []);
    } catch (error) {
      console.error('Error loading devices:', error);
    }
  };

  const loadTemplateStatus = async () => {
    try {
      const response = await axios.get('/api/packages/templates');
      setTemplateStatus(response.data?.templates || null);
    } catch (error) {
      console.error('Error loading template status:', error);
    }
  };

  const generatePackage = async () => {
    setGenerating(true);
    try {
      const response = await axios.post('/api/packages/generate');

      if (response.data.success) {
        const newSession = {
          session_id: response.data.sessionId,
          technician_id: technician.id || technician.username || 'technician',
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

  const uploadTemplate = async () => {
    if (!templateFile) {
      alert('Select a file to upload.');
      return;
    }

    setUploadingTemplate(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', templateFile);

      const response = await axios.post(`/api/packages/templates?type=${templateType}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percent);
        }
      });

      if (response.data?.success) {
        setTemplateFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        await loadTemplateStatus();
      } else {
        alert('Template upload failed.');
      }
    } catch (error) {
      console.error('Error uploading template:', error);
      alert('Error uploading template: ' + (error.response?.data?.error || error.message));
    } finally {
      setUploadingTemplate(false);
      setUploadProgress(0);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes && bytes !== 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  };

  const formatDateTime = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString();
  };

  const connectToSession = async (sessionId) => {
    try {
      // Request connection approval
      const response = await axios.post(`/api/sessions/${sessionId}/connect`, {
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

  const requestSessionForDevice = async (deviceId) => {
    setRequestingDevice(deviceId);
    try {
      const response = await axios.post(`/api/devices/${deviceId}/request`);
      if (response.data.success) {
        const newSession = {
          session_id: response.data.sessionId,
          technician_id: technician.id || technician.username || 'technician',
          status: 'waiting',
          created_at: new Date().toISOString()
        };
        setSessions(prev => [newSession, ...prev]);
        alert('Session requested. Ask the user to open the helper.');
      }
    } catch (error) {
      console.error('Error requesting session:', error);
      alert('Error requesting session: ' + (error.response?.data?.error || error.message));
    } finally {
      setRequestingDevice(null);
    }
  };

  const logout = async () => {
    if (onLogout) {
      await onLogout();
    }
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
        <div className="dashboard-search">
          <label htmlFor="dashboard-search-input">Search</label>
          <input
            id="dashboard-search-input"
            type="text"
            placeholder="Session ID, hostname, or device name…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value.trim())}
            className="dashboard-search-input"
            aria-label="Filter sessions and devices"
          />
        </div>
        <div className="sessions-list" style={{ marginBottom: '30px' }}>
          <h2>Registered Devices</h2>
          {devices.length === 0 ? (
            <div className="empty-state">
              <p>No registered devices yet</p>
              <p>Once a customer runs the helper, they will appear here.</p>
            </div>
          ) : (
            <div className="sessions-grid">
              {devices
                .filter((device) => {
                  if (!searchQuery) return true;
                  const q = searchQuery.toLowerCase();
                  return (
                    (device.display_name || '').toLowerCase().includes(q) ||
                    (device.hostname || '').toLowerCase().includes(q) ||
                    (device.device_id || '').toLowerCase().includes(q)
                  );
                })
                .map(device => (
                <div key={device.device_id} className="session-card">
                  <div className="session-header">
                    <span className="session-id">{device.display_name || device.hostname || device.device_id}</span>
                    <span className={`status-badge ${device.pending_session_id ? 'waiting' : 'ready'}`}>
                      {device.pending_session_id ? 'Pending' : 'Ready'}
                    </span>
                  </div>

                  <div className="session-info">
                    <div className="client-info">
                      <strong>OS:</strong> {device.os || 'Unknown'}<br />
                      <strong>Hostname:</strong> {device.hostname || 'Unknown'}
                    </div>
                    <div className="session-meta">
                      <small>Last seen: {device.last_seen ? new Date(device.last_seen).toLocaleString() : 'Never'}</small>
                    </div>
                  </div>

                  <div className="session-actions">
                    <button
                      onClick={() => requestSessionForDevice(device.device_id)}
                      className="connect-btn"
                      disabled={requestingDevice === device.device_id}
                    >
                      {requestingDevice === device.device_id ? 'Requesting...' : 'Request Session'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dashboard-actions">
          <button 
            onClick={generatePackage} 
            disabled={generating}
            className="generate-btn"
          >
            {generating ? 'Generating...' : '➕ Generate Support Package'}
          </button>

            <div className="template-card">
              <div className="template-title">Helper Templates</div>
              <div className="template-status">
                <div className={`template-status-item ${templateStatus?.exe?.available ? 'ready' : 'missing'}`}>
                  EXE: {templateStatus?.exe?.available ? 'Installed' : 'Missing'}
                </div>
                <div className={`template-status-item ${templateStatus?.dmg?.available ? 'ready' : 'missing'}`}>
                  DMG: {templateStatus?.dmg?.available ? 'Installed' : 'Missing'}
                </div>
              </div>
              <div className="template-meta">
                <div className="template-meta-row">
                  <span className="template-meta-label">EXE</span>
                  <span className="template-meta-value">
                    {formatBytes(templateStatus?.exe?.size)} · {formatDateTime(templateStatus?.exe?.updatedAt)}
                  </span>
                </div>
                <div className="template-meta-row">
                  <span className="template-meta-label">DMG</span>
                  <span className="template-meta-value">
                    {formatBytes(templateStatus?.dmg?.size)} · {formatDateTime(templateStatus?.dmg?.updatedAt)}
                  </span>
                </div>
              </div>
            <div className="template-row">
              <select
                value={templateType}
                onChange={(e) => setTemplateType(e.target.value)}
                className="template-select"
              >
                <option value="exe">Windows (EXE)</option>
                <option value="dmg">macOS (DMG)</option>
              </select>
              <input
                ref={fileInputRef}
                type="file"
                onChange={(e) => setTemplateFile(e.target.files?.[0] || null)}
                className="template-file"
              />
              <button
                onClick={uploadTemplate}
                disabled={uploadingTemplate || !templateFile}
                className="template-upload-btn"
              >
                {uploadingTemplate ? `Uploading... ${uploadProgress}%` : 'Upload Template'}
              </button>
            </div>
            {uploadingTemplate && (
              <div className="upload-progress" style={{ marginTop: '10px' }}>
                <div style={{
                  width: '100%',
                  height: '20px',
                  backgroundColor: '#e2e8f0',
                  borderRadius: '10px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${uploadProgress}%`,
                    height: '100%',
                    backgroundColor: uploadProgress === 100 ? '#10b981' : '#2563eb',
                    borderRadius: '10px',
                    transition: 'width 0.3s ease, background-color 0.3s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}>
                    {uploadProgress > 10 && `${uploadProgress}%`}
                  </div>
                </div>
                <div style={{ textAlign: 'center', marginTop: '5px', fontSize: '12px', color: '#64748b' }}>
                  {uploadProgress === 100 ? 'Processing...' : `Uploading ${templateFile?.name || 'file'}...`}
                </div>
              </div>
            )}
            <div className="template-hint">
              Upload a template once. New sessions will auto-copy it.
            </div>
          </div>
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
              {sessions
                .filter((session) => {
                  if (!searchQuery) return true;
                  const q = searchQuery.toLowerCase();
                  const sid = session.session_id || session.sessionId || '';
                  const host = (session.client_info && session.client_info.hostname) || '';
                  return sid.toLowerCase().includes(q) || host.toLowerCase().includes(q);
                })
                .map(session => (
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
                        onClick={() => connectToSession(session.session_id || session.sessionId)}
                        className="connect-btn"
                      >
                        Connect
                      </button>
                    ) : (
                      <span className="waiting-text">Waiting for user...</span>
                    )}
                    <button
                      onClick={() => deleteSession(session.session_id || session.sessionId)}
                      className="delete-btn"
                      style={{
                        marginLeft: '10px',
                        padding: '8px 16px',
                        background: '#dc2626',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {appVersion && (
        <footer className="dashboard-footer">
          <span>Remote Support Platform v{appVersion}</span>
        </footer>
      )}
    </div>
  );
}

export default Dashboard;
