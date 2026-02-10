import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';
import './ClassicDashboard.css';

function ClassicDashboard({ user, onLogout }) {
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
  const [templatesNew, setTemplatesNew] = useState(false);
  const [templatesLatestTs, setTemplatesLatestTs] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [sessionStatusFilter, setSessionStatusFilter] = useState('all');
  const [sessionSortBy, setSessionSortBy] = useState('date');
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

  const templatesSeenKey = 'rs_templates_seen_ts';
  const computeLatestTemplateTs = (templates) => {
    if (!templates) return 0;
    const ts = ['exe', 'dmg']
      .map(k => templates?.[k]?.updatedAt)
      .filter(Boolean)
      .map(v => new Date(v).getTime())
      .filter(n => Number.isFinite(n));
    return ts.length ? Math.max(...ts) : 0;
  };

  const refreshTemplatesNew = (templatesOverride) => {
    const t = templatesOverride || templateStatus;
    const latest = computeLatestTemplateTs(t);
    setTemplatesLatestTs(latest);
    const seen = Number(localStorage.getItem(templatesSeenKey) || 0);
    setTemplatesNew(latest > seen);
  };

  // One-time badge: once shown, auto-clear.
  useEffect(() => {
    if (!templatesNew) return;
    const latest = templatesLatestTs || computeLatestTemplateTs(templateStatus);
    if (latest) localStorage.setItem(templatesSeenKey, String(latest));
    const t = setTimeout(() => setTemplatesNew(false), 2500);
    return () => clearTimeout(t);
  }, [templatesNew, templatesLatestTs, templateStatus]);

  const setupWebSocket = () => {
    const socket = io(window.location.origin);

    // Listen for new sessions (from helper /assign or technician /generate)
    socket.on('session-created', (data) => {
      setSessions(prev => {
        const exists = prev.some(s => (s.session_id || s.sessionId) === data.sessionId);
        if (exists) return prev;
        return [{
          session_id: data.sessionId,
          status: data.status || 'waiting',
          created_at: data.created_at || new Date().toISOString(),
          technician_id: data.technician_id,
          device_id: data.device_id,
          client_info: data.client_info,
          link: data.link,
          downloadUrl: data.downloadUrl
        }, ...prev];
      });
    });

    // Listen for session updates (global broadcast) — upsert: update if exists, add if not
    socket.on('session-updated', (data) => {
      setSessions(prev => {
        const exists = prev.some(s => (s.session_id || s.sessionId) === data.sessionId);
        if (exists) {
          return prev.map(s => {
            const sId = s.session_id || s.sessionId;
            if (sId === data.sessionId) {
              return {
                ...s,
                status: data.status ?? s.status,
                client_info: data.clientInfo ?? s.client_info,
                helper_connected: data.helper_connected ?? s.helper_connected,
                active_technicians: data.active_technicians ?? s.active_technicians
              };
            }
            return s;
          });
        }
        return [{
          session_id: data.sessionId,
          status: data.status,
          client_info: data.clientInfo,
          helper_connected: data.helper_connected,
          active_technicians: data.active_technicians,
          created_at: new Date().toISOString()
        }, ...prev];
      });
    });

    // Also listen for specific session-connected events — upsert
    socket.on('session-connected', (data) => {
      setSessions(prev => {
        const exists = prev.some(s => (s.session_id || s.sessionId) === data.sessionId);
        if (exists) {
          return prev.map(s => {
            const sId = s.session_id || s.sessionId;
            if (sId === data.sessionId) {
              return { ...s, status: 'connected', client_info: data.clientInfo };
            }
            return s;
          });
        }
        return [{
          session_id: data.sessionId,
          status: 'connected',
          client_info: data.clientInfo,
          created_at: new Date().toISOString()
        }, ...prev];
      });
    });

    // Listen for session deletion (broadcast globally)
    socket.on('session-ended', (data) => {
      setSessions(prev => prev.filter(s => {
        const sId = s.session_id || s.sessionId;
        return sId !== data.sessionId;
      }));
    });

    socket.on('device-updated', (data) => {
      if (!data?.deviceId) return;
      setDevices(prev => prev.map(d => d.device_id === data.deviceId ? {
        ...d,
        last_ip: data.last_ip ?? d.last_ip,
        last_country: data.last_country ?? d.last_country,
        last_region: data.last_region ?? d.last_region,
        last_city: data.last_city ?? d.last_city
      } : d));
    });

    socket.on('templates-updated', (data) => {
      const t = data?.templates || null;
      setTemplateStatus(t);
      refreshTemplatesNew(t);
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

  const deregisterDevice = async (deviceId, label) => {
    if (!confirm(`Deregister device "${label}"? It will be removed from the list. The device can re-register next time the helper runs.`)) return;
    try {
      await axios.delete(`/api/devices/${deviceId}`);
      setDevices(prev => prev.filter(d => d.device_id !== deviceId));
    } catch (error) {
      console.error('Error deregistering device:', error);
      alert('Error deregistering device: ' + (error.response?.data?.error || error.message));
    }
  };

  const loadTemplateStatus = async () => {
    try {
      const response = await axios.get('/api/packages/templates');
      const t = response.data?.templates || null;
      setTemplateStatus(t);
      refreshTemplatesNew(t);
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
        <div className="dashboard-header-brand">
          <img src="/logo.png" alt="Logo" className="dashboard-logo" />
          <h1>Remote Support Dashboard</h1>
        </div>
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
          <h2>Active Sessions</h2>
          <div className="dashboard-session-filters" style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>Status</label>
            <select value={sessionStatusFilter} onChange={e => setSessionStatusFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}>
              <option value="all">All</option>
              <option value="connected">Connected</option>
              <option value="waiting">Waiting</option>
            </select>
            <label style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>Sort</label>
            <select value={sessionSortBy} onChange={e => setSessionSortBy(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}>
              <option value="date">Date (newest)</option>
              <option value="status">Status</option>
              <option value="hostname">Hostname</option>
            </select>
          </div>
          {sessions.length === 0 ? (
            <div className="empty-state">
              <p>No active sessions</p>
              <p>Generate a package to start a support session</p>
            </div>
          ) : (
            <div className="sessions-grid">
              {sessions
                .filter((session) => {
                  if (searchQuery) {
                    const q = searchQuery.toLowerCase();
                    const sid = session.session_id || session.sessionId || '';
                    const host = (session.client_info && session.client_info.hostname) || session.device_hostname || '';
                    const cname = session.customer_name || '';
                    const mname = session.machine_name || '';
                    if (!sid.toLowerCase().includes(q) && !host.toLowerCase().includes(q) && !cname.toLowerCase().includes(q) && !mname.toLowerCase().includes(q)) return false;
                  }
                  if (sessionStatusFilter !== 'all') {
                    const status = (session.status || '').toLowerCase();
                    if (sessionStatusFilter === 'connected' && status !== 'connected') return false;
                    if (sessionStatusFilter === 'waiting' && status === 'connected') return false;
                  }
                  return true;
                })
                .sort((a, b) => {
                  if (sessionSortBy === 'status') {
                    const sa = (a.status || '').toLowerCase();
                    const sb = (b.status || '').toLowerCase();
                    return sa.localeCompare(sb) || (new Date(b.created_at) - new Date(a.created_at));
                  }
                  if (sessionSortBy === 'date') return new Date(b.created_at || 0) - new Date(a.created_at || 0);
                  if (sessionSortBy === 'hostname') {
                    const ha = (a.client_info && a.client_info.hostname) || (a.session_id || a.sessionId) || '';
                    const hb = (b.client_info && b.client_info.hostname) || (b.session_id || b.sessionId) || '';
                    return ha.localeCompare(hb, undefined, { sensitivity: 'base' }) || (new Date(b.created_at) - new Date(a.created_at));
                  }
                  return 0;
                })
                .map(session => {
                const hostname = (session.client_info && session.client_info.hostname) || session.device_hostname || '';
                const os = (session.client_info && session.client_info.os) || session.device_os || '';
                return (
                <div key={session.session_id} className="session-card">
                  <div className="session-header">
                    <span className="session-id">
                      {session.session_id}
                      {(session.customer_name || session.machine_name) && (
                        <span style={{ marginLeft: 10, fontWeight: 700 }}>
                          {(session.customer_name || '—')}{session.machine_name ? ` / ${session.machine_name}` : ''}
                        </span>
                      )}
                    </span>
                    <span className="status-badges">
                      <span className={`status-badge ${(session.helper_connected === true || session.status === 'connected') ? 'connected' : 'waiting'}`}>
                        {(session.helper_connected === true || session.status === 'connected') ? 'helper online' : 'helper offline'}
                      </span>
                      <span className={`status-badge ${(Number(session.viewing_technicians || 0) > 0) ? 'connected' : 'waiting'}`}>
                        {Number(session.viewing_technicians || 0) > 0 ? `tech viewing${Number(session.viewing_technicians || 0) > 1 ? ` (${Number(session.viewing_technicians || 0)})` : ''}` : 'not viewing'}
                      </span>
                    </span>
                  </div>

                  <div className="session-info">
                    <div className="client-info">
                      {(session.customer_name || session.machine_name) && (
                        <><strong>Customer:</strong> {session.customer_name || '—'}{session.machine_name ? ` / ${session.machine_name}` : ''}<br /></>
                      )}
                      <strong>OS:</strong> {os || 'Unknown'}<br />
                      <strong>Hostname:</strong> {hostname || 'Waiting for connection...'}
                    </div>

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
                    {(session.status === 'connected' || session.helper_connected === true) ? (
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
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
              })}
            </div>
          )}
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
                      {device.pending_session_id && (
                        <><br /><strong>Session:</strong> {device.pending_session_id}</>
                      )}
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
                    <button
                      onClick={() => deregisterDevice(device.device_id, device.display_name || device.hostname || device.device_id)}
                      className="delete-btn"
                    >
                      Deregister
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dashboard-actions">

            <div className="template-card">
              <div className="template-title-row">
                <div className="template-title">Helper Templates</div>
                {templatesNew && (
                  <div
                    className="template-new-badge"
                    title="New templates uploaded"
                    onClick={() => {
                      const latest = templatesLatestTs || computeLatestTemplateTs(templateStatus);
                      if (latest) localStorage.setItem(templatesSeenKey, String(latest));
                      setTemplatesNew(false);
                    }}
                  >
                    New
                  </div>
                )}
              </div>
              <div className="template-status">
                <div className={`template-status-item ${templateStatus?.exe?.available ? 'ready' : 'missing'}`}>
                  EXE: {templateStatus?.exe?.available ? 'Installed' : 'Missing'}
                  {templateStatus?.exe?.version && <span className="template-version"> · v{templateStatus.exe.version}</span>}
                </div>
                <div className={`template-status-item ${templateStatus?.dmg?.available ? 'ready' : 'missing'}`}>
                  DMG: {templateStatus?.dmg?.available ? 'Installed' : 'Missing'}
                  {templateStatus?.dmg?.version && <span className="template-version"> · v{templateStatus.dmg.version}</span>}
                </div>
              </div>
              <div className="template-meta">
                <div className="template-meta-row">
                  <span className="template-meta-label">EXE</span>
                  <span className="template-meta-value">
                    {formatBytes(templateStatus?.exe?.size)} · {formatDateTime(templateStatus?.exe?.updatedAt)}
                    {templateStatus?.exe?.version && ` · v${templateStatus.exe.version}`}
                  </span>
                </div>
                <div className="template-meta-row">
                  <span className="template-meta-label">DMG</span>
                  <span className="template-meta-value">
                    {formatBytes(templateStatus?.dmg?.size)} · {formatDateTime(templateStatus?.dmg?.updatedAt)}
                    {templateStatus?.dmg?.version && ` · v${templateStatus.dmg.version}`}
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

      </div>
      {appVersion && (
        <footer className="dashboard-footer">
          <span>Remote Support Platform v{appVersion}</span>
        </footer>
      )}
    </div>
  );
}

export default ClassicDashboard;
