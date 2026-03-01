import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../../api/axios';
import WidgetCard from './WidgetCard';

function QuickConnectWidget({ size, linkTo }) {
  const [sessions, setSessions] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    axios.get('/api/sessions').then(r => {
      const connected = (r.data.sessions || []).filter(s => s.status === 'connected' || s.helper_connected === true);
      setSessions(connected.slice(0, 3));
    }).catch(() => {});
  }, []);

  const connect = async (sid) => {
    try {
      const r = await axios.post(`/api/sessions/${sid}/connect`, {});
      if (r.data.approved) navigate(`/session/${sid}`);
    } catch (_) {}
  };

  return (
    <WidgetCard title="Quick Connect" size={size} linkTo={linkTo}>
      {sessions.length === 0 ? (
        <p className="widget-empty">No sessions ready to connect.</p>
      ) : (
        sessions.map(s => {
          const sid = s.session_id || s.sessionId;
          return (
            <div key={sid} className="widget-row">
              <span className="widget-row-id">{sid}</span>
              <button className="widget-link-btn" onClick={() => connect(sid)}>Connect</button>
            </div>
          );
        })
      )}
    </WidgetCard>
  );
}

export default QuickConnectWidget;
