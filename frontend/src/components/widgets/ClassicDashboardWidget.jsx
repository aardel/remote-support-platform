import React from 'react';
import { Link } from 'react-router-dom';
import WidgetCard from './WidgetCard';

function ClassicDashboardWidget({ size, linkTo }) {
  return (
    <WidgetCard title="Classic View" size={size} linkTo={linkTo}>
      <p className="widget-desc">Open the original single-page dashboard.</p>
      <Link to="/dashboard/classic" className="widget-btn widget-btn-secondary" style={{ display: 'inline-block', textDecoration: 'none' }}>Open Classic Dashboard</Link>
    </WidgetCard>
  );
}

export default ClassicDashboardWidget;
