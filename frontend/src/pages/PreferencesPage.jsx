import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './PageStyles.css';

const RETENTION_OPTIONS = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: -1, label: 'Forever' },
  { value: 0, label: "Don't keep" },
];

function PreferencesPage() {
  const [retention, setRetention] = useState(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/preferences').then(r => {
      const days = r.data.sessionHistoryRetentionDays;
      setRetention(days === null || days === undefined ? -1 : days);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    try {
      const val = retention === -1 ? null : retention;
      await axios.put('/api/preferences', { sessionHistoryRetentionDays: val });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert('Error saving: ' + (e.response?.data?.error || e.message));
    }
  };

  if (loading) return <div className="page-empty">Loading...</div>;

  return (
    <div className="page-container">
      <div className="page-header"><h2>Preferences</h2></div>
      <div className="page-card" style={{ maxWidth: 480 }}>
        <div className="card-top"><span style={{ fontWeight: 600 }}>Session History Retention</span></div>
        <p style={{ fontSize: 13, color: '#64748b', margin: '8px 0 12px', lineHeight: 1.5 }}>
          Choose how long ended sessions are kept for statistics. Sessions older than this are automatically deleted.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={retention} onChange={e => setRetention(Number(e.target.value))} className="page-select" style={{ minWidth: 140 }}>
            {RETENTION_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button className="btn-sm btn-primary" onClick={save}>{saved ? 'Saved!' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

export default PreferencesPage;
