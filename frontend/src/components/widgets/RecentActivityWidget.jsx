import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../../api/axios';
import WidgetCard from './WidgetCard';

function daysLeft(expiresAt) {
  if (!expiresAt) return null;
  const ts = new Date(expiresAt).getTime();
  if (!Number.isFinite(ts)) return null;
  const ms = ts - Date.now();
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  return days;
}

function RecentActivityWidget({ size, linkTo }) {
  const [sessions, setSessions] = useState([]);
  const navigate = useNavigate();
  const limit = size === 'large' ? 7 : 5;

  useEffect(() => {
    axios.get('/api/sessions').then(r => setSessions(r.data.sessions || [])).catch(() => {});
  }, []);

  const connect = async (sid) => {
    try {
      const r = await axios.post(`/api/sessions/${sid}/connect`, {});
      if (r.data.approved) navigate(`/session/${sid}`);
    } catch (_) {}
  };

  return (
    <WidgetCard title="Recent Activity" size={size} linkTo={linkTo}>
      {sessions.length === 0 ? (
        <p className="widget-empty">No recent sessions.</p>
      ) : (
        sessions.slice(0, limit).map(s => {
          const sid = s.session_id || s.sessionId;
          const ready = s.status === 'connected' || s.helper_connected === true;
          const unassigned = !(s.device_id || s.deviceId) && !ready;
          const dleft = unassigned ? daysLeft(s.expires_at || s.expiresAt) : null;
          const customer = s.customer_name || s.customerName || '';
          const machine = s.machine_name || s.machineName || '';
          const label = (customer || machine)
            ? `${customer || '—'}${machine ? ` / ${machine}` : ''}`
            : unassigned
              ? `Invite link (unassigned)${typeof dleft === 'number' ? ` • ${Math.max(0, dleft)} day${Math.max(0, dleft) === 1 ? '' : 's'} left` : ''}`
              : '';
          return (
            <div key={sid} className="widget-row">
              <span className="widget-row-id">
                {sid}{label ? <span style={{ marginLeft: 8, fontWeight: 800 }}>{label}</span> : null}
              </span>
              <span className={`widget-badge ${s.status === 'connected' ? 'wb-ok' : 'wb-warn'}`}>{s.status}</span>
              <span className="widget-row-meta">{new Date(s.created_at).toLocaleTimeString()}</span>
              {ready && <button className="widget-link-btn" onClick={() => connect(sid)}>Connect</button>}
            </div>
          );
        })
      )}
    </WidgetCard>
  );
}

export default RecentActivityWidget;
