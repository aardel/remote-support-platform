import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';
import WidgetCard from './WidgetCard';

function HelperTemplatesWidget({ size }) {
  const [status, setStatus] = useState(null);
  const [isNew, setIsNew] = useState(false);

  const seenKey = 'rs_templates_seen_ts';

  const computeLatestTs = (templates) => {
    const ts = ['exe', 'dmg']
      .map(k => templates?.[k]?.updatedAt)
      .filter(Boolean)
      .map(v => new Date(v).getTime())
      .filter(n => Number.isFinite(n));
    return ts.length ? Math.max(...ts) : 0;
  };

  useEffect(() => {
    axios.get('/api/packages/templates').then(r => {
      const t = r.data?.templates || null;
      setStatus(t);
      const latest = computeLatestTs(t);
      const seen = Number(localStorage.getItem(seenKey) || 0);
      setIsNew(latest > seen);
    }).catch(() => {});
  }, []);

  // Realtime updates
  useEffect(() => {
    const socket = io(window.location.origin);
    socket.on('templates-updated', (data) => {
      const t = data?.templates || null;
      setStatus(t);
      const latest = computeLatestTs(t);
      const seen = Number(localStorage.getItem(seenKey) || 0);
      setIsNew(latest > seen);
    });
    return () => socket.disconnect();
  }, []);

  // One-time badge: once shown, auto-clear.
  useEffect(() => {
    if (!isNew) return;
    const latest = computeLatestTs(status);
    if (latest) localStorage.setItem(seenKey, String(latest));
    const t = setTimeout(() => setIsNew(false), 2500);
    return () => clearTimeout(t);
  }, [isNew, status]);

  return (
    <WidgetCard
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Helper Templates</span>
          {isNew && <span className="widget-badge wb-warn">New</span>}
        </span>
      }
      size={size}
    >
      <div className="widget-row">
        <span>EXE</span>
        <span className={`widget-badge ${status?.exe?.available ? 'wb-ok' : 'wb-danger'}`}>{status?.exe?.available ? 'OK' : 'Missing'}</span>
      </div>
      <div className="widget-row">
        <span>DMG</span>
        <span className={`widget-badge ${status?.dmg?.available ? 'wb-ok' : 'wb-danger'}`}>{status?.dmg?.available ? 'OK' : 'Missing'}</span>
      </div>
      <Link
        to="/helper-templates"
        className="widget-view-all"
        onClick={() => {
          const latest = computeLatestTs(status);
          if (latest) localStorage.setItem(seenKey, String(latest));
          setIsNew(false);
        }}
      >
        Manage &rarr;
      </Link>
    </WidgetCard>
  );
}

export default HelperTemplatesWidget;
