import React, { useState, useEffect } from 'react';
import axios from '../api/axios';
import './PageStyles.css';

function formatDuration(ms) {
  if (ms == null) return '—';
  if (ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function StatisticsPage() {
  const [sessions, setSessions] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');

  useEffect(() => { loadStats(); }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterFrom) params.set('from', filterFrom);
      if (filterTo) params.set('to', filterTo);
      if (filterCustomer) params.set('customer', filterCustomer);
      const res = await axios.get(`/api/statistics/sessions?${params.toString()}`);
      setSessions(res.data.sessions || []);
      setSummary(res.data.summary || {});
    } catch (e) {
      console.error('Error loading statistics:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header"><h2>Statistics</h2></div>

      {/* Summary cards */}
      <div className="stats-summary">
        <div className="stat-card">
          <div className="stat-value">{summary.totalSessions ?? '—'}</div>
          <div className="stat-label">Total Sessions</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{formatDuration(summary.totalDurationMs)}</div>
          <div className="stat-label">Total Duration</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{summary.uniqueCustomers ?? '—'}</div>
          <div className="stat-label">Unique Customers</div>
        </div>
      </div>

      {/* Filters */}
      <div className="page-toolbar" style={{ flexWrap: 'wrap' }}>
        <label className="filter-label">
          From
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="page-input" />
        </label>
        <label className="filter-label">
          To
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="page-input" />
        </label>
        <label className="filter-label">
          Customer
          <input type="text" placeholder="Name..." value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)} className="page-input" />
        </label>
        <button className="btn-sm btn-primary" onClick={loadStats}>Apply</button>
      </div>

      {loading ? (
        <div className="page-empty">Loading...</div>
      ) : sessions.length === 0 ? (
        <div className="page-empty">No session data found for the selected filters.</div>
      ) : (
        <div className="page-table-wrap">
          <table className="page-table stats-table">
            <thead>
              <tr>
                <th>Session ID</th>
                <th>Status</th>
                <th>Started</th>
                <th>Ended</th>
                <th>Duration</th>
                <th>Customer</th>
                <th>Machine</th>
                <th>OS</th>
                <th>IP</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s, i) => (
                <tr key={i}>
                  <td className="mono">{s.sessionId}</td>
                  <td><span className={`badge ${s.status === 'connected' ? 'badge-ok' : s.status === 'waiting' ? 'badge-warn' : 'badge-neutral'}`}>{s.status}</span></td>
                  <td>{s.connectedAt ? new Date(s.connectedAt).toLocaleString() : new Date(s.createdAt).toLocaleString()}</td>
                  <td>{s.endedAt ? new Date(s.endedAt).toLocaleString() : '—'}</td>
                  <td>{formatDuration(s.durationMs)}</td>
                  <td>{s.customerName || '—'}</td>
                  <td>{s.machineName || '—'}</td>
                  <td>{s.os || '—'}</td>
                  <td className="mono">{s.ip || '—'}</td>
                  <td>{[s.city, s.region, s.country].filter(Boolean).join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default StatisticsPage;
