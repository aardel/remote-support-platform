import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';
import './PageStyles.css';

function SessionsPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const navigate = useNavigate();

  useEffect(() => {
    loadSessions();
    const socket = io(window.location.origin);
    socket.on('session-created', (data) => {
      setSessions(prev => {
        if (prev.some(s => (s.session_id || s.sessionId) === data.sessionId)) return prev;
        return [{ session_id: data.sessionId, status: data.status || 'waiting', created_at: data.created_at || new Date().toISOString(), client_info: data.client_info, link: data.link }, ...prev];
      });
    });
    socket.on('session-updated', (data) => {
      setSessions(prev => prev.map(s => (s.session_id || s.sessionId) === data.sessionId ? {
        ...s,
        status: data.status ?? s.status,
        client_info: data.clientInfo ?? s.client_info,
        helper_connected: data.helper_connected ?? s.helper_connected,
        active_technicians: data.active_technicians ?? s.active_technicians
      } : s));
    });
    socket.on('session-connected', (data) => {
      setSessions(prev => prev.map(s => (s.session_id || s.sessionId) === data.sessionId ? { ...s, status: 'connected', client_info: data.clientInfo || s.client_info } : s));
    });
    socket.on('session-ended', (data) => {
      setSessions(prev => prev.filter(s => (s.session_id || s.sessionId) !== data.sessionId));
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

  const connectToSession = async (sessionId) => {
    try {
      const res = await axios.post(`/api/sessions/${sessionId}/connect`, {});
      if (res.data.approved) navigate(`/session/${sessionId}`);
      else alert('Connection denied: ' + (res.data.reason || 'User denied'));
    } catch (e) {
      alert('Error connecting: ' + (e.response?.data?.error || e.message));
    }
  };

  const deleteSession = async (sessionId) => {
    if (!confirm(`Delete session ${sessionId}?`)) return;
    try {
      await axios.delete(`/api/sessions/${sessionId}`);
      setSessions(prev => prev.filter(s => (s.session_id || s.sessionId) !== sessionId));
    } catch (e) {
      alert('Error: ' + (e.response?.data?.error || e.message));
    }
  };

  const filtered = sessions
    .filter(s => {
      if (search) {
        const q = search.toLowerCase();
        const sid = s.session_id || s.sessionId || '';
        const host = (s.client_info && s.client_info.hostname) || '';
        if (!sid.toLowerCase().includes(q) && !host.toLowerCase().includes(q) && !(s.status || '').toLowerCase().includes(q)) return false;
      }
      if (statusFilter !== 'all') {
        const status = (s.status || '').toLowerCase();
        if (statusFilter === 'connected' && status !== 'connected') return false;
        if (statusFilter === 'waiting' && status === 'connected') return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'status') {
        const sa = (a.status || '').toLowerCase();
        const sb = (b.status || '').toLowerCase();
        return sa.localeCompare(sb) || (new Date(b.created_at) - new Date(a.created_at));
      }
      if (sortBy === 'date') return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      if (sortBy === 'hostname') {
        const ha = (a.client_info && a.client_info.hostname) || (a.session_id || a.sessionId) || '';
        const hb = (b.client_info && b.client_info.hostname) || (b.session_id || b.sessionId) || '';
        return ha.localeCompare(hb, undefined, { sensitivity: 'base' }) || (new Date(b.created_at) - new Date(a.created_at));
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
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="page-select" aria-label="Filter by status">
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
            const customer = s.customer_name || s.customerName || '—';
            const machine = s.machine_name || s.machineName || s.hostname || '—';
            return (
              <div key={sid} className="page-card">
                <div className="card-top">
                  <span className="card-id">
                    <span className="mono">{sid}</span>
                    <span className="card-title-extra"><strong>{customer}</strong>{machine && machine !== '—' ? ` / ${machine}` : ''}</span>
                  </span>
                  <span className={`badge ${s.status === 'connected' ? 'badge-ok' : 'badge-warn'}`}>{s.status}</span>
                </div>
                {s.client_info && (
                  <div className="card-meta">
                    <span>OS: {s.client_info.os || '—'}</span>
                    <span>Host: {s.client_info.hostname || '—'}</span>
                  </div>
                )}
                <div className="card-meta">
                  <span>Created: {new Date(s.created_at).toLocaleString()}</span>
                </div>
                {s.link && (
                  <div className="card-link">
                    <input type="text" value={s.link} readOnly onClick={e => e.target.select()} className="link-input" />
                    <button className="btn-sm btn-secondary" onClick={() => { navigator.clipboard.writeText(s.link); }}>Copy</button>
                  </div>
                )}
                <div className="card-actions">
                  {(s.status === 'connected' || s.helper_connected === true) ? (
                    <button className="btn-sm btn-primary" onClick={() => connectToSession(sid)}>Connect</button>
                  ) : (
                    <span className="muted" style={{ fontSize: 13 }}>Waiting for user...</span>
                  )}
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
