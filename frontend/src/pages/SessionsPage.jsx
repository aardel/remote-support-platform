import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import axios from '../api/axios';
import './PageStyles.css';

const SOCKET_PATH = '/remote/socket.io';
const BASE = '/remote';

function SessionsPage() {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('all');
    const [sortBy, setSortBy] = useState('date');
    const navigate = useNavigate();

    useEffect(() => {
        loadSessions();
        const socket = io(window.location.origin, { path: SOCKET_PATH });
        socket.on('session-created', (d) => {
            setSessions(prev =>
                prev.some(s => (s.session_id || s.sessionId) === d.sessionId) ? prev
                    : [{ session_id: d.sessionId, status: d.status || 'waiting', created_at: d.created_at || new Date().toISOString(), client_info: d.client_info, link: d.link }, ...prev]
            );
        });
        socket.on('session-updated', (d) => {
            setSessions(prev => prev.map(s => (s.session_id || s.sessionId) === d.sessionId ? { ...s, status: d.status ?? s.status, client_info: d.clientInfo ?? s.client_info, helper_connected: d.helper_connected ?? s.helper_connected, active_technicians: d.active_technicians ?? s.active_technicians } : s));
        });
        socket.on('session-connected', (d) => {
            setSessions(prev => prev.map(s => (s.session_id || s.sessionId) === d.sessionId ? { ...s, status: 'connected', client_info: d.clientInfo || s.client_info } : s));
        });
        socket.on('session-ended', (d) => {
            setSessions(prev => prev.filter(s => (s.session_id || s.sessionId) !== d.sessionId));
        });
        return () => socket.disconnect();
    }, []);

    const loadSessions = async () => {
        try {
            const res = await axios.get('/api/sessions');
            setSessions(res.data.sessions || []);
        } catch (e) {
            console.error('Error loading sessions:', e);
        } finally {
            setLoading(false);
        }
    };

    const connectToSession = async (sid) => {
        try {
            const res = await axios.post(`/api/sessions/${sid}/connect`, {});
            if (res.data.approved) navigate(`/session/${sid}`);
            else alert('Connection denied: ' + (res.data.reason || 'User denied'));
        } catch (e) {
            alert('Error connecting: ' + (e.response?.data?.error || e.message));
        }
    };

    const deleteSession = async (sid) => {
        if (!confirm(`Delete session ${sid}?`)) return;
        try {
            await axios.delete(`/api/sessions/${sid}`);
            setSessions(prev => prev.filter(s => (s.session_id || s.sessionId) !== sid));
        } catch (e) {
            alert('Error: ' + (e.response?.data?.error || e.message));
        }
    };

    const daysUntilExpiry = (expiresAt) => {
        if (!expiresAt) return null;
        const t = new Date(expiresAt).getTime();
        if (!Number.isFinite(t)) return null;
        return Math.max(0, Math.ceil((t - Date.now()) / (24 * 60 * 60 * 1000)));
    };

    const filtered = sessions
        .filter(s => {
            if (search) {
                const q = search.toLowerCase();
                const sid = s.session_id || s.sessionId || '';
                const host = s.client_info?.hostname || '';
                if (!sid.toLowerCase().includes(q) && !host.toLowerCase().includes(q) && !(s.status || '').toLowerCase().includes(q)) return false;
            }
            if (status !== 'all') {
                const st = (s.status || '').toLowerCase();
                if (status === 'connected' && st !== 'connected') return false;
                if (status === 'waiting' && st === 'connected') return false;
            }
            return true;
        })
        .sort((a, b) => {
            if (sortBy === 'status') {
                const cmp = (a.status || '').localeCompare(b.status || '');
                return cmp || new Date(b.created_at) - new Date(a.created_at);
            }
            if (sortBy === 'date') return new Date(b.created_at || 0) - new Date(a.created_at || 0);
            if (sortBy === 'hostname') {
                const ah = a.client_info?.hostname || a.session_id || a.sessionId || '';
                const bh = b.client_info?.hostname || b.session_id || b.sessionId || '';
                return ah.localeCompare(bh, undefined, { sensitivity: 'base' }) || new Date(b.created_at) - new Date(a.created_at);
            }
            return 0;
        });

    return (
        <div className="page-container">
            <div className="page-header">
                <h2>Active Sessions</h2>
                <span className="page-count">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</span>
            </div>

            <div className="page-toolbar">
                <input type="text" placeholder="Search sessions..." value={search} onChange={e => setSearch(e.target.value)} className="page-search" />
                <label className="page-toolbar-label">Status</label>
                <select value={status} onChange={e => setStatus(e.target.value)} className="page-select" aria-label="Filter by status">
                    <option value="all">All</option>
                    <option value="connected">Connected</option>
                    <option value="waiting">Waiting</option>
                </select>
                <label className="page-toolbar-label">Sort</label>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="page-select" aria-label="Sort by">
                    <option value="date">Date (newest)</option>
                    <option value="status">Status</option>
                    <option value="hostname">Hostname</option>
                </select>
            </div>

            {loading ? (
                <div className="page-empty">Loading...</div>
            ) : filtered.length === 0 ? (
                <div className="page-empty">{search ? 'No sessions match.' : 'No active sessions. Generate a support package to start one.'}</div>
            ) : (
                <div className="page-cards">
                    {filtered.map(s => {
                        const sid = s.session_id || s.sessionId;
                        const cname = s.customer_name || s.customerName || '—';
                        const mname = s.machine_name || s.machineName || s.hostname || '—';
                        const isInvite = !(s.helper_connected === true || s.status === 'connected') && !(s.device_id || s.deviceId);
                        const expiry = isInvite ? daysUntilExpiry(s.expires_at || s.expiresAt) : null;
                        const link = s.link || `${window.location.origin}${BASE}/support/${encodeURIComponent(sid)}`;

                        return (
                            <div key={sid} className="page-card">
                                <div className="card-top">
                                    <span className="card-id">
                                        <span className="mono">{sid}</span>
                                        <span className="card-title-extra"><strong>{cname}</strong>{mname && mname !== '—' ? ` / ${mname}` : ''}</span>
                                    </span>
                                    <span style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                        <span className={`badge ${s.helper_connected === true || s.status === 'connected' ? 'badge-ok' : 'badge-warn'}`}>
                                            {s.helper_connected === true || s.status === 'connected' ? 'helper online' : 'helper offline'}
                                        </span>
                                        <span className={`badge ${Number(s.viewing_technicians || 0) > 0 ? 'badge-ok' : 'badge-warn'}`}>
                                            {Number(s.viewing_technicians || 0) > 0
                                                ? `tech viewing${Number(s.viewing_technicians || 0) > 1 ? ` (${Number(s.viewing_technicians || 0)})` : ''}`
                                                : 'not viewing'}
                                        </span>
                                    </span>
                                </div>

                                {s.client_info && (
                                    <div className="card-meta">
                                        <span>OS: {s.client_info.os || '—'}</span>
                                        <span>Host: {s.client_info.hostname || '—'}</span>
                                    </div>
                                )}

                                <div className="card-meta">
                                    <span>Created: {new Date(s.created_at).toLocaleString()}</span>
                                    {isInvite && typeof expiry === 'number' && (
                                        <span title="Unassigned invite sessions are auto-deleted after the TTL">
                                            Purge in: <span className="mono">{expiry}</span> day{expiry === 1 ? '' : 's'}
                                        </span>
                                    )}
                                </div>

                                {isInvite && (
                                    <div className="card-link">
                                        <input type="text" value={link} readOnly onClick={e => e.target.select()} className="link-input" />
                                        <button className="btn-sm btn-secondary" onClick={() => navigator.clipboard.writeText(link)}>Copy</button>
                                    </div>
                                )}

                                <div className="card-actions">
                                    {s.status === 'connected' || s.helper_connected === true
                                        ? <button className="btn-sm btn-primary" onClick={() => connectToSession(sid)}>Connect</button>
                                        : <span className="muted" style={{ fontSize: 13 }}>Waiting for user...</span>}
                                    <button className="btn-sm btn-danger" onClick={() => deleteSession(sid)}>Delete</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default SessionsPage;
