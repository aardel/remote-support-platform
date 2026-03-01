import React, { useState, useEffect } from 'react';
import axios from '../api/axios';
import './GenerateModal.css';

function GenerateModal({ open, onClose }) {
  const [mode, setMode] = useState('new'); // 'new' | 'device'
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setResult(null);
      setError(null);
      setGenerating(false);
      setMode('new');
      axios.get('/api/devices').then(r => setDevices(r.data.devices || [])).catch(() => {});
    }
  }, [open]);

  if (!open) return null;

  const generateNew = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await axios.post('/api/packages/generate');
      if (res.data.success) {
        setResult({ sessionId: res.data.sessionId, link: res.data.directLink });
        navigator.clipboard.writeText(res.data.directLink).catch(() => {});
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setGenerating(false);
    }
  };

  const requestForDevice = async () => {
    if (!selectedDevice) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await axios.post(`/api/devices/${selectedDevice}/request`);
      if (res.data.success) {
        setResult({ sessionId: res.data.sessionId, link: null, message: 'Session requested. Ask the user to open the helper.' });
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="gm-overlay" onClick={onClose}>
      <div className="gm-modal" onClick={e => e.stopPropagation()}>
        <div className="gm-header">
          <h3>Generate Support Package</h3>
          <button className="gm-close" onClick={onClose}>&times;</button>
        </div>

        {result ? (
          <div className="gm-body">
            <div className="gm-success">
              <div className="gm-success-icon">✓</div>
              <p><strong>Session {result.sessionId}</strong></p>
              {result.link && (
                <>
                  <p style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>Share this link with the customer:</p>
                  <div className="gm-link-row">
                    <input type="text" value={result.link} readOnly onClick={e => e.target.select()} className="gm-link-input" />
                    <button className="gm-copy-btn" onClick={() => navigator.clipboard.writeText(result.link)}>Copy</button>
                  </div>
                  <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>Link copied to clipboard.</p>
                </>
              )}
              {result.message && <p style={{ fontSize: 13, color: '#64748b' }}>{result.message}</p>}
            </div>
            <div className="gm-footer">
              <button className="gm-btn gm-btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <div className="gm-body">
            <div className="gm-tabs">
              <button className={`gm-tab ${mode === 'new' ? 'active' : ''}`} onClick={() => setMode('new')}>New Session</button>
              <button className={`gm-tab ${mode === 'device' ? 'active' : ''}`} onClick={() => setMode('device')}>Existing Device</button>
            </div>

            {mode === 'new' ? (
              <div className="gm-section">
                <p className="gm-desc">Generate a new session with a shareable download link for the customer.</p>
              </div>
            ) : (
              <div className="gm-section">
                <p className="gm-desc">Request a session for a registered device. The customer must have the helper running.</p>
                <select value={selectedDevice} onChange={e => setSelectedDevice(e.target.value)} className="gm-select">
                  <option value="">Select a device...</option>
                  {devices.map(d => (
                    <option key={d.device_id} value={d.device_id}>
                      {d.customer_name || d.display_name || d.hostname || d.device_id}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {error && <div className="gm-error">{error}</div>}

            <div className="gm-footer">
              <button className="gm-btn gm-btn-secondary" onClick={onClose}>Cancel</button>
              <button
                className="gm-btn gm-btn-primary"
                onClick={mode === 'new' ? generateNew : requestForDevice}
                disabled={generating || (mode === 'device' && !selectedDevice)}
              >
                {generating ? 'Generating...' : mode === 'new' ? 'Generate Package' : 'Request Session'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default GenerateModal;
