import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import './PageStyles.css';

function fmtDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function CasesPage() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [deviceId, setDeviceId] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  const load = async (opts = {}) => {
    setLoading(true);
    try {
      const params = {};
      const qq = (opts.q ?? q).trim();
      const st = opts.status ?? status;
      const dev = (opts.deviceId ?? deviceId).trim();
      if (qq) params.q = qq;
      if (st !== 'all') params.status = st;
      if (dev) params.deviceId = dev;
      const res = await axios.get('/api/cases', { params });
      setCases(res.data.cases || []);
    } catch (e) {
      console.error('Load cases failed', e);
      setCases([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const dev = sp.get('deviceId') || '';
    if (dev) setDeviceId(dev);
    load({ deviceId: dev });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onApply = () => load();
  const clearDevice = () => {
    setDeviceId('');
    const sp = new URLSearchParams(location.search);
    sp.delete('deviceId');
    navigate({ pathname: '/cases', search: sp.toString() ? `?${sp.toString()}` : '' }, { replace: true });
    load({ deviceId: '' });
  };

  const downloadPdf = (caseId) => {
    // Compute base path from current location (e.g., "/remote")
    const pathPrefix = window.location.pathname.split('/').slice(0, -1).join('/') || '';
    const pdfUrl = `${pathPrefix}/api/cases/${encodeURIComponent(caseId)}/pdf`;
    window.open(pdfUrl, '_blank');
  };

  const deleteCase = async (caseId) => {
    if (!window.confirm('Delete this case report? This cannot be undone.')) return;
    try {
      await axios.delete(`/api/cases/${encodeURIComponent(caseId)}`);
      setCases(prev => prev.filter(c => c.id !== caseId));
    } catch (e) {
      alert('Failed to delete case: ' + (e.response?.data?.error || e.message));
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>Online Cases</h2>
        <span className="page-count">{cases.length} case{cases.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="page-toolbar">
        <input
          type="text"
          className="page-search"
          placeholder="Search cases..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <input
          type="text"
          className="page-input"
          placeholder="Device ID (optional)"
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
        />
        {deviceId && (
          <button className="btn-sm btn-secondary" onClick={clearDevice}>Clear device</button>
        )}
        <label className="page-toolbar-label">Status</label>
        <select className="page-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
        <button className="btn-sm btn-primary" onClick={onApply}>Apply</button>
      </div>

      {loading ? (
        <div className="page-empty">Loading...</div>
      ) : cases.length === 0 ? (
        <div className="page-empty">{q ? 'No cases match.' : 'No cases yet.'}</div>
      ) : (
        <div className="page-table-wrap">
          <table className="page-table">
            <thead>
              <tr>
                <th>Case</th>
                <th>Created</th>
                <th>Customer</th>
                <th>Machine</th>
                <th>Technician</th>
                <th>Remote</th>
                <th>Phone</th>
                <th>WhatsApp</th>
                <th>Total</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.case_number || c.id}</td>
                  <td>{c.created_at ? new Date(c.created_at).toLocaleString() : '—'}</td>
                  <td>{c.customer_name || '—'}</td>
                  <td>{c.machine_name || '—'}</td>
                  <td>{c.technician_name || '—'}</td>
                  <td className="mono">{fmtDuration(c.remote_viewing_seconds || 0)}</td>
                  <td className="mono">{Number(c.phone_support_minutes || 0)}m</td>
                  <td className="mono">{Number(c.whatsapp_support_minutes || 0)}m</td>
                  <td className="mono">{fmtDuration(c.billable_total_seconds || 0)}</td>
                  <td>
                    <span className={`badge ${String(c.status || '').toLowerCase() === 'open' ? 'badge-warn' : 'badge-neutral'}`}>
                      {c.status || '—'}
                    </span>
                  </td>
                  <td className="actions-cell">
                    <button className="btn-sm btn-secondary" onClick={() => downloadPdf(c.id)}>PDF</button>
                    <button className="btn-sm btn-danger" onClick={() => deleteCase(c.id)} style={{ marginLeft: 4 }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default CasesPage;
