import React, { useState, useEffect, useRef } from 'react';
import axios from '../api/axios';
import './PageStyles.css';

const VARIANT_LABELS = {
  win: 'Windows 10/11 (EXE)',
  win7: 'Windows 7/8/8.1 (EXE)',
  mac: 'macOS (DMG)',
  xp: 'Windows XP / Legacy (ZIP)'
};

function HelperTemplatesPage() {
  const [templateStatus, setTemplateStatus] = useState(null);
  const [templateType, setTemplateType] = useState('exe');
  const [templateFile, setTemplateFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [variants, setVariants] = useState([]);
  const [copiedVariant, setCopiedVariant] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => { loadStatus(); loadVariants(); }, []);

  const computeLatestTs = (templates) => {
    const ts = ['exe', 'dmg']
      .map(k => templates?.[k]?.updatedAt)
      .filter(Boolean)
      .map(v => new Date(v).getTime())
      .filter(n => Number.isFinite(n));
    return ts.length ? Math.max(...ts) : 0;
  };

  const loadStatus = async () => {
    try {
      const res = await axios.get('/api/packages/templates');
      const t = res.data?.templates || null;
      setTemplateStatus(t);
      const latest = computeLatestTs(t);
      if (latest) localStorage.setItem('rs_templates_seen_ts', String(latest));
    } catch (e) {
      console.error('Error loading templates:', e);
    }
  };

  const loadVariants = async () => {
    try {
      const res = await axios.get('/api/packages/universal');
      setVariants(res.data?.variants || []);
    } catch (e) {
      console.error('Error loading download variants:', e);
    }
  };

  const copyLink = (variant) => {
    const url = `${window.location.origin}/api/packages/universal/${variant}`;
    navigator.clipboard.writeText(url);
    setCopiedVariant(variant);
    setTimeout(() => setCopiedVariant(null), 1500);
  };

  const upload = async () => {
    if (!templateFile) return alert('Select a file.');
    setUploading(true);
    setUploadProgress(0);
    try {
      const form = new FormData();
      form.append('file', templateFile);
      await axios.post(`/api/packages/templates?type=${templateType}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (p) => setUploadProgress(Math.round((p.loaded * 100) / p.total))
      });
      setTemplateFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadStatus();
    } catch (e) {
      alert('Upload failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const fmt = (bytes) => {
    if (!bytes && bytes !== 0) return '—';
    const u = ['B', 'KB', 'MB', 'GB'];
    let v = bytes, i = 0;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleString() : '—';

  return (
    <div className="page-container">
      <div className="page-header"><h2>Helper Templates</h2></div>
      <div className="template-grid">
        {['exe', 'dmg'].map(type => {
          const t = templateStatus?.[type];
          return (
            <div key={type} className="page-card">
              <div className="card-top">
                <span style={{ fontWeight: 600 }}>{type === 'exe' ? 'Windows (EXE)' : 'macOS (DMG)'}</span>
                <span className={`badge ${t?.available ? 'badge-ok' : 'badge-danger'}`}>{t?.available ? 'Installed' : 'Missing'}</span>
              </div>
              {t?.available && (
                <div className="card-meta">
                  <span>Size: {fmt(t.size)}</span>
                  <span>Updated: {fmtDate(t.updatedAt)}</span>
                  {t.version && <span>Version: v{t.version}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="page-card" style={{ marginTop: 20 }}>
        <div className="card-top"><span style={{ fontWeight: 600 }}>Upload Template</span></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <select value={templateType} onChange={e => setTemplateType(e.target.value)} className="page-select">
            <option value="exe">Windows (EXE)</option>
            <option value="dmg">macOS (DMG)</option>
          </select>
          <input ref={fileInputRef} type="file" onChange={e => setTemplateFile(e.target.files?.[0] || null)} style={{ flex: 1, minWidth: 180 }} />
          <button className="btn-sm btn-primary" onClick={upload} disabled={uploading || !templateFile}>
            {uploading ? `Uploading ${uploadProgress}%` : 'Upload'}
          </button>
        </div>
        {uploading && (
          <div style={{ marginTop: 10, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${uploadProgress}%`, height: '100%', background: '#2563eb', transition: 'width 0.3s' }} />
          </div>
        )}
        <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>Upload a template once. New sessions will auto-copy it.</p>
      </div>

      <div className="page-header" style={{ marginTop: 28 }}><h2 style={{ fontSize: 18 }}>Shareable Download Links</h2></div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 14, fontSize: 12 }}>
        Direct links to the current install. No session code embedded — safe to send to any customer for a first-time install.
      </p>
      <div className="template-grid">
        {variants.map(v => (
          <div key={v.variant} className="page-card">
            <div className="card-top">
              <span style={{ fontWeight: 600 }}>{VARIANT_LABELS[v.variant] || v.variant}</span>
              <span className={`badge ${v.available ? 'badge-ok' : 'badge-danger'}`}>{v.available ? 'Available' : 'Missing'}</span>
            </div>
            {v.available && (
              <>
                <div className="card-meta">
                  <span>Size: {fmt(v.size)}</span>
                  {v.version && <span>Version: v{v.version}</span>}
                </div>
                <div className="card-link">
                  <input className="link-input" readOnly value={`${window.location.origin}${v.downloadUrl}`} onFocus={e => e.target.select()} />
                </div>
                <div className="card-actions">
                  <button className="btn-sm btn-secondary" onClick={() => copyLink(v.variant)}>
                    {copiedVariant === v.variant ? 'Copied!' : 'Copy link'}
                  </button>
                  <a className="btn-sm btn-primary" href={v.downloadUrl} style={{ textDecoration: 'none' }}>Download</a>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default HelperTemplatesPage;
