import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from '../../api/axios';
import WidgetCard from './WidgetCard';

function StatsSummaryWidget({ size, linkTo }) {
  const [summary, setSummary] = useState({});

  useEffect(() => {
    axios.get('/api/statistics/sessions').then(r => setSummary(r.data.summary || {})).catch(() => {});
  }, []);

  const fmt = (ms) => {
    if (!ms) return '0m';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <WidgetCard title="Statistics" size={size} linkTo={linkTo}>
      <div className="widget-stats-row">
        <div className="widget-mini-stat">
          <span className="wms-value">{summary.totalSessions ?? '—'}</span>
          <span className="wms-label">Sessions</span>
        </div>
        <div className="widget-mini-stat">
          <span className="wms-value">{fmt(summary.totalDurationMs)}</span>
          <span className="wms-label">Duration</span>
        </div>
        <div className="widget-mini-stat">
          <span className="wms-value">{summary.uniqueCustomers ?? '—'}</span>
          <span className="wms-label">Customers</span>
        </div>
      </div>
      <Link to="/statistics" className="widget-view-all">View full stats &rarr;</Link>
    </WidgetCard>
  );
}

export default StatsSummaryWidget;
