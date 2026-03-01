import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import axios from '../api/axios';
import './Dashboard.css';

const SOCKET_PATH = '/remote/socket.io';

function ClassicDashboard({ user, onLogout }) {
    const [sessions, setSessions] = useState([]);
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [requestingDevice, setReqDev] = useState(null);
    const [templateType, setTemplateType] = useState('exe');
    const [templateFile, setTemplateFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [templateStatus, setTplStatus] = useState(null);
    const [tplBadge, setTplBadge] = useState(false);
    const [tplLatestTs, setTplLatestTs] = useState(0);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortBy, setSortBy] = useState('date');
    const [version, setVersion] = useState(null);
    const fileRef = useRef(null);
    const navigate = useNavigate();
    const info = user || {};

    useEffect(() => {
        loadSessions();
        loadDevices();
        loadTemplates();
        setupSocket();
        axios.get('/api/version').then(r => setVersion(r.data.version)).catch(() => { });
    }, []);

    const LS_KEY = 'rs_templates_seen_ts';

    const maxTs = (t) => {
        if (!t) return 0;
        const times = ['exe', 'dmg'].map(k => t?.[k]?.updatedAt).filter(Boolean).map(d => new Date(d).getTime()).filter(n => Number.isFinite(n));
        return times.length ? Math.max(...times) : 0;
    };

    const checkTplNotify = (t) => {
        const ts = maxTs(t || templateStatus);
        setTplLatestTs(ts);
        const seen = Number(localStorage.getItem(LS_KEY) || 0);
        setTplBadge(ts > seen);
    };

    useEffect(() => {
        if (!tplBadge) return;
        const ts = tplLatestTs || maxTs(templateStatus);
        if (ts) localStorage.setItem(LS_KEY, String(ts));
        const timer = setTimeout(() => setTplBadge(false), 2500);
        return () => clearTimeout(timer);
    }, [tplBadge, tplLatestTs, templateStatus]);

    const setupSocket = () => {
        const socket = io(window.location.origin, { path: SOCKET_PATH });
        socket.on('session-created', d => setSessions(prev => prev.some(s => (s.session_id || s.sessionId) === d.sessionId) ? prev : [{ session_id: d.sessionId, status: d.status || 'waiting', created_at: d.created_at || new Date().toISOString(), technician_id: d.technician_id, device_id: d.device_id, client_info: d.client_info, link: d.link, downloadUrl: d.downloadUrl }, ...prev]));
        socket.on('session-updated', d => setSessions(prev => prev.some(s => (s.session_id || s.sessionId) === d.sessionId) ? prev.map(s => (s.session_id || s.sessionId) === d.sessionId ? { ...s, status: d.status ?? s.status, client_info: d.clientInfo ?? s.client_info, helper_connected: d.helper_connected ?? s.helper_connected, active_technicians: d.active_technicians ?? s.active_technicians } : s) : [{ session_id: d.sessionId, status: d.status, client_info: d.clientInfo, helper_connected: d.helper_connected, active_technicians: d.active_technicians, created_at: new Date().toISOString() }, ...prev]));
        socket.on('session-connected', d => setSessions(prev => prev.some(s => (s.session_id || s.sessionId) === d.sessionId) ? prev.map(s => (s.session_id || s.sessionId) === d.sessionId ? { ...s, status: 'connected', client_info: d.clientInfo } : s) : [{ session_id: d.sessionId, status: 'connected', client_info: d.clientInfo, created_at: new Date().toISOString() }, ...prev]));
        socket.on('session-ended', d => setSessions(prev => prev.filter(s => (s.session_id || s.sessionId) !== d.sessionId)));
        socket.on('device-updated', d => { if (d?.deviceId) setDevices(prev => prev.map(dev => dev.device_id === d.deviceId ? { ...dev, last_ip: d.last_ip ?? dev.last_ip, last_country: d.last_country ?? dev.last_country, last_region: d.last_region ?? dev.last_region, last_city: d.last_city ?? dev.last_city } : dev)); });
        socket.on('templates-updated', d => { const t = d?.templates || null; setTplStatus(t); checkTplNotify(t); });
        return () => socket.disconnect();
    };

    const loadSessions = async () => {
        try { const r = await axios.get('/api/sessions'); setSessions(r.data.sessions || []); setLoading(false); } catch { setLoading(false); }
    };
    const loadDevices = async () => { try { const r = await axios.get('/api/devices'); setDevices(r.data.devices || []); } catch { } };
    const loadTemplates = async () => { try { const r = await axios.get('/api/packages/templates'); const t = r.data?.templates || null; setTplStatus(t); checkTplNotify(t); } catch { } };

    const deleteSession = async (sid) => {
        if (!confirm(`Delete session ${sid}?`)) return;
        try { await axios.delete(`/api/sessions/${sid}`); setSessions(prev => prev.filter(s => (s.session_id || s.sessionId) !== sid)); } catch (e) { alert('Error deleting session: ' + (e.response?.data?.error || e.message)); }
    };

    const deregDevice = async (did, label) => {
        if (!confirm(`Deregister device "${label}"? It will be removed from the list. The device can re-register next time the helper runs.`)) return;
        try { await axios.delete(`/api/devices/${did}`); setDevices(prev => prev.filter(d => d.device_id !== did)); } catch (e) { alert('Error deregistering device: ' + (e.response?.data?.error || e.message)); }
    };

    const connectSession = async (sid) => {
        try {
            const r = await axios.post(`/api/sessions/${sid}/connect`, { technicianName: info.username });
            if (r.data.approved) navigate(`/session/${sid}`);
            else alert('Connection denied: ' + (r.data.reason || 'User denied'));
        } catch (e) { alert('Error connecting: ' + (e.response?.data?.error || e.message)); }
    };

    const reqDevice = async (did) => {
        setReqDev(did);
        try {
            const r = await axios.post(`/api/devices/${did}/request`);
            if (r.data.success) {
                const s = { session_id: r.data.sessionId, technician_id: info.id || info.username || 'technician', status: 'waiting', created_at: new Date().toISOString() };
                setSessions(prev => [s, ...prev]);
                alert('Session requested. Ask the user to open the helper.');
            }
        } catch (e) { alert('Error requesting session: ' + (e.response?.data?.error || e.message)); }
        finally { setReqDev(null); }
    };

    const uploadTemplate = async () => {
        if (!templateFile) { alert('Select a file to upload.'); return; }
        setUploading(true); setUploadProgress(0);
        try {
            const form = new FormData(); form.append('file', templateFile);
            const r = await axios.post(`/api/packages/templates?type=${templateType}`, form, { headers: { 'Content-Type': 'multipart/form-data' }, onUploadProgress: p => setUploadProgress(Math.round(p.loaded * 100 / p.total)) });
            if (r.data?.success) { setTemplateFile(null); if (fileRef.current) fileRef.current.value = ''; await loadTemplates(); } else alert('Template upload failed.');
        } catch (e) { alert('Error uploading template: ' + (e.response?.data?.error || e.message)); }
        finally { setUploading(false); setUploadProgress(0); }
    };

    const fmtSize = (b) => { if (!b && b !== 0) return '—'; const u = ['B', 'KB', 'MB', 'GB']; let v = b, i = 0; while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; } return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`; };
    const fmtDate = (d) => { if (!d) return '—'; const dt = new Date(d); return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleString(); };

    return (
        <div className="dashboard">
            <div className="dashboard-content">
                <div className="dashboard-subheader">
                    <h1>Remote Support Dashboard</h1>
                </div>
                {/* Search */}
                <div className="dashboard-search">
                    <label htmlFor="dashboard-search-input">Search</label>
                    <input id="dashboard-search-input" type="text" placeholder="Session ID, hostname, or device name…" value={search} onChange={e => setSearch(e.target.value.trim())} className="dashboard-search-input" aria-label="Filter sessions and devices" />
                </div>

                {/* Sessions */}
                <div className="sessions-list" style={{ marginBottom: '30px' }}>
                    <h2>Active Sessions</h2>
                    <div className="dashboard-session-filters" style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                        <label style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>Status</label>
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}>
                            <option value="all">All</option>
                            <option value="connected">Connected</option>
                            <option value="waiting">Waiting</option>
                        </select>
                        <label style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>Sort</label>
                        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}>
                            <option value="date">Date (newest)</option>
                            <option value="status">Status</option>
                            <option value="hostname">Hostname</option>
                        </select>
                    </div>
                    {sessions.length === 0 ? (
                        <div className="empty-state"><p>No active sessions</p><p>Generate a package to start a support session</p></div>
                    ) : (
                        <div className="sessions-grid">
                            {sessions
                                .filter(s => {
                                    if (search) {
                                        const q = search.toLowerCase();
                                        const sid = s.session_id || s.sessionId || '';
                                        const host = s.client_info?.hostname || s.device_hostname || '';
                                        const cname = s.customer_name || '';
                                        const mname = s.machine_name || '';
                                        if (!sid.toLowerCase().includes(q) && !host.toLowerCase().includes(q) && !cname.toLowerCase().includes(q) && !mname.toLowerCase().includes(q)) return false;
                                    }
                                    if (statusFilter !== 'all') {
                                        const st = (s.status || '').toLowerCase();
                                        if (statusFilter === 'connected' && st !== 'connected') return false;
                                        if (statusFilter === 'waiting' && st === 'connected') return false;
                                    }
                                    return true;
                                })
                                .sort((a, b) => {
                                    if (sortBy === 'status') return (a.status || '').localeCompare(b.status || '') || new Date(b.created_at) - new Date(a.created_at);
                                    if (sortBy === 'date') return new Date(b.created_at || 0) - new Date(a.created_at || 0);
                                    if (sortBy === 'hostname') return (a.client_info?.hostname || a.session_id || '').localeCompare(b.client_info?.hostname || b.session_id || '', undefined, { sensitivity: 'base' }) || new Date(b.created_at) - new Date(a.created_at);
                                    return 0;
                                })
                                .map(s => {
                                    const host = s.client_info?.hostname || s.device_hostname || '';
                                    const os = s.client_info?.os || s.device_os || '';
                                    return (
                                        <div key={s.session_id} className="session-card">
                                            <div className="session-header">
                                                <span className="session-id">
                                                    {s.session_id}
                                                    {(s.customer_name || s.machine_name) && <span style={{ marginLeft: 10, fontWeight: 700 }}>{s.customer_name || '—'}{s.machine_name ? ` / ${s.machine_name}` : ''}</span>}
                                                </span>
                                                <span className="status-badges">
                                                    <span className={`status-badge ${s.helper_connected === true || s.status === 'connected' ? 'connected' : 'waiting'}`}>{s.helper_connected === true || s.status === 'connected' ? 'helper online' : 'helper offline'}</span>
                                                    <span className={`status-badge ${Number(s.viewing_technicians || 0) > 0 ? 'connected' : 'waiting'}`}>{Number(s.viewing_technicians || 0) > 0 ? `tech viewing${Number(s.viewing_technicians || 0) > 1 ? ` (${Number(s.viewing_technicians || 0)})` : ''}` : 'not viewing'}</span>
                                                </span>
                                            </div>
                                            <div className="session-info">
                                                <div className="client-info">
                                                    {(s.customer_name || s.machine_name) && <><strong>Customer:</strong> {s.customer_name || '—'}{s.machine_name ? ` / ${s.machine_name}` : ''}<br /></>}
                                                    <strong>OS:</strong> {os || 'Unknown'}<br />
                                                    <strong>Hostname:</strong> {host || 'Waiting for connection...'}
                                                </div>
                                                <div className="session-meta"><small>Created: {new Date(s.created_at).toLocaleString()}</small></div>
                                            </div>
                                            {s.link && (
                                                <div className="session-info">
                                                    <div className="share-link-section" style={{ marginTop: '15px', padding: '10px', background: '#f0f9ff', borderRadius: '6px' }}>
                                                        <strong style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '5px' }}>Share this link:</strong>
                                                        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                                            <input type="text" value={s.link} readOnly style={{ flex: 1, padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', fontFamily: 'monospace' }} onClick={e => e.target.select()} />
                                                            <button onClick={() => { navigator.clipboard.writeText(s.link); alert('Link copied to clipboard!'); }} style={{ padding: '6px 12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Copy</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            <div className="session-actions">
                                                {s.status === 'connected' || s.helper_connected === true
                                                    ? <button onClick={() => connectSession(s.session_id || s.sessionId)} className="connect-btn">Connect</button>
                                                    : <span className="waiting-text">Waiting for user...</span>}
                                                <button onClick={() => deleteSession(s.session_id || s.sessionId)} className="delete-btn">Delete</button>
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </div>

                {/* Devices */}
                <div className="sessions-list" style={{ marginBottom: '30px' }}>
                    <h2>Registered Devices</h2>
                    {devices.length === 0 ? (
                        <div className="empty-state"><p>No registered devices yet</p><p>Once a customer runs the helper, they will appear here.</p></div>
                    ) : (
                        <div className="sessions-grid">
                            {devices.filter(d => { if (!search) return true; const q = search.toLowerCase(); return (d.display_name || '').toLowerCase().includes(q) || (d.hostname || '').toLowerCase().includes(q) || (d.device_id || '').toLowerCase().includes(q); }).map(d => (
                                <div key={d.device_id} className="session-card">
                                    <div className="session-header">
                                        <span className="session-id">{d.display_name || d.hostname || d.device_id}</span>
                                        <span className={`status-badge ${d.pending_session_id ? 'waiting' : 'ready'}`}>{d.pending_session_id ? 'Pending' : 'Ready'}</span>
                                    </div>
                                    <div className="session-info">
                                        <div className="client-info">
                                            <strong>OS:</strong> {d.os || 'Unknown'}<br />
                                            <strong>Hostname:</strong> {d.hostname || 'Unknown'}
                                            {d.pending_session_id && <><br /><strong>Session:</strong> {d.pending_session_id}</>}
                                        </div>
                                        <div className="session-meta"><small>Last seen: {d.last_seen ? new Date(d.last_seen).toLocaleString() : 'Never'}</small></div>
                                    </div>
                                    <div className="session-actions">
                                        <button onClick={() => reqDevice(d.device_id)} className="connect-btn" disabled={requestingDevice === d.device_id}>{requestingDevice === d.device_id ? 'Requesting...' : 'Request Session'}</button>
                                        <button onClick={() => deregDevice(d.device_id, d.display_name || d.hostname || d.device_id)} className="delete-btn">Deregister</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Templates */}
                <div className="dashboard-actions">
                    <div className="template-card">
                        <div className="template-title-row">
                            <div className="template-title">Helper Templates</div>
                            {tplBadge && <div className="template-new-badge" title="New templates uploaded" onClick={() => { const ts = tplLatestTs || maxTs(templateStatus); if (ts) localStorage.setItem(LS_KEY, String(ts)); setTplBadge(false); }}>New</div>}
                        </div>
                        <div className="template-status">
                            <div className={`template-status-item ${templateStatus?.exe?.available ? 'ready' : 'missing'}`}>EXE: {templateStatus?.exe?.available ? 'Installed' : 'Missing'}{templateStatus?.exe?.version && <span className="template-version"> · v{templateStatus.exe.version}</span>}</div>
                            <div className={`template-status-item ${templateStatus?.dmg?.available ? 'ready' : 'missing'}`}>DMG: {templateStatus?.dmg?.available ? 'Installed' : 'Missing'}{templateStatus?.dmg?.version && <span className="template-version"> · v{templateStatus.dmg.version}</span>}</div>
                        </div>
                        <div className="template-meta">
                            <div className="template-meta-row"><span className="template-meta-label">EXE</span><span className="template-meta-value">{fmtSize(templateStatus?.exe?.size)} · {fmtDate(templateStatus?.exe?.updatedAt)}{templateStatus?.exe?.version && ` · v${templateStatus.exe.version}`}</span></div>
                            <div className="template-meta-row"><span className="template-meta-label">DMG</span><span className="template-meta-value">{fmtSize(templateStatus?.dmg?.size)} · {fmtDate(templateStatus?.dmg?.updatedAt)}{templateStatus?.dmg?.version && ` · v${templateStatus.dmg.version}`}</span></div>
                        </div>
                        <div className="template-row">
                            <select value={templateType} onChange={e => setTemplateType(e.target.value)} className="template-select"><option value="exe">Windows (EXE)</option><option value="dmg">macOS (DMG)</option></select>
                            <input ref={fileRef} type="file" onChange={e => setTemplateFile(e.target.files?.[0] || null)} className="template-file" />
                            <button onClick={uploadTemplate} disabled={uploading || !templateFile} className="template-upload-btn">{uploading ? `Uploading... ${uploadProgress}%` : 'Upload Template'}</button>
                        </div>
                        {uploading && (
                            <div className="upload-progress" style={{ marginTop: '10px' }}>
                                <div style={{ width: '100%', height: '20px', backgroundColor: '#e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                                    <div style={{ width: `${uploadProgress}%`, height: '100%', backgroundColor: uploadProgress === 100 ? '#10b981' : '#2563eb', borderRadius: '10px', transition: 'width 0.3s ease, background-color 0.3s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '12px', fontWeight: 'bold' }}>{uploadProgress > 10 && `${uploadProgress}%`}</div>
                                </div>
                                <div style={{ textAlign: 'center', marginTop: '5px', fontSize: '12px', color: '#64748b' }}>{uploadProgress === 100 ? 'Processing...' : `Uploading ${templateFile?.name || 'file'}...`}</div>
                            </div>
                        )}
                        <div className="template-hint">Upload a template once. New sessions will auto-copy it.</div>
                    </div>
                </div>
            </div>

            {version && <footer className="dashboard-footer"><span>Remote Support Platform v{version}</span></footer>}
        </div>
    );
}

export default ClassicDashboard;
