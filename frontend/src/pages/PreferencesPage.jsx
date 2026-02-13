import React, { useState, useEffect } from 'react';
import axios from '../api/axios';
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
  const [phoneSupportRate, setPhoneSupportRate] = useState(0);
  const [whatsappSupportRate, setWhatsappSupportRate] = useState(0);
  const [remoteControlSupportRate, setRemoteControlSupportRate] = useState(0);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/preferences').then(r => {
      const days = r.data.sessionHistoryRetentionDays;
      setRetention(days === null || days === undefined ? -1 : days);
      setPhoneSupportRate(Number(r.data.phoneSupportRate ?? 0));
      setWhatsappSupportRate(Number(r.data.whatsappSupportRate ?? 0));
      setRemoteControlSupportRate(Number(r.data.remoteControlSupportRate ?? 0));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const parseRateInput = (value) => {
    if (value === '') return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  };

  const save = async () => {
    try {
      const val = retention === -1 ? null : retention;
      await axios.put('/api/preferences', {
        sessionHistoryRetentionDays: val,
        phoneSupportRate,
        whatsappSupportRate,
        remoteControlSupportRate
      });
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

      <div className="page-card" style={{ maxWidth: 480, marginTop: 14 }}>
        <div className="card-top"><span style={{ fontWeight: 600 }}>Remote Support Rates</span></div>
        <p style={{ fontSize: 13, color: '#64748b', margin: '8px 0 12px', lineHeight: 1.5 }}>
          Set default rates used for reporting and billing references.
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          <label className="page-toolbar-label">
            Phone support rate
            <input
              type="number"
              min="0"
              step="0.01"
              className="page-input"
              value={phoneSupportRate}
              onChange={(e) => setPhoneSupportRate(parseRateInput(e.target.value))}
              style={{ width: '100%', marginTop: 4 }}
            />
          </label>
          <label className="page-toolbar-label">
            WhatsApp support rate
            <input
              type="number"
              min="0"
              step="0.01"
              className="page-input"
              value={whatsappSupportRate}
              onChange={(e) => setWhatsappSupportRate(parseRateInput(e.target.value))}
              style={{ width: '100%', marginTop: 4 }}
            />
          </label>
          <label className="page-toolbar-label">
            Remote control support rate
            <input
              type="number"
              min="0"
              step="0.01"
              className="page-input"
              value={remoteControlSupportRate}
              onChange={(e) => setRemoteControlSupportRate(parseRateInput(e.target.value))}
              style={{ width: '100%', marginTop: 4 }}
            />
          </label>
          <div>
            <button className="btn-sm btn-primary" onClick={save}>{saved ? 'Saved!' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PreferencesPage;
